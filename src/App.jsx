import { useEffect, useState } from 'react'
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import './App.css'

const gradeBands = [
  { label: 'Easy', range: '0% to 4%', colorClass: 'grade grade-green' },
  { label: 'Moderate', range: '4% to 8%', colorClass: 'grade grade-yellow' },
  { label: 'Steep', range: '8%+', colorClass: 'grade grade-red' },
]

const radiusOptions = [
  { label: '0.25 miles', meters: 402 },
  { label: '0.5 miles', meters: 805 },
  { label: '1 mile', meters: 1609 },
]

const defaultAddress = 'Civic Center, San Francisco, CA'
const defaultCenter = [37.7749, -122.4194]
const streetLimit = 80
const elevationSamplesPerSegment = 4
const elevationBatchSize = 40

function RecenterMap({ center }) {
  const map = useMap()

  useEffect(() => {
    map.flyTo(center, map.getZoom(), {
      animate: true,
      duration: 1.2,
    })
  }, [center, map])

  return null
}

function metersToMilesLabel(meters) {
  return `${(meters / 1609.34).toFixed(1)} mi`
}

function calculateDistanceInMeters(start, end) {
  const latDistance = (end[0] - start[0]) * 111320
  const averageLatitude = ((start[0] + end[0]) / 2) * (Math.PI / 180)
  const lngDistance = (end[1] - start[1]) * 111320 * Math.cos(averageLatitude)

  return Math.hypot(latDistance, lngDistance)
}

function calculateDistanceToCenter(position, center) {
  return calculateDistanceInMeters(position, center)
}

function calculateSegmentLength(positions) {
  let totalMeters = 0

  for (let index = 1; index < positions.length; index += 1) {
    totalMeters += calculateDistanceInMeters(positions[index - 1], positions[index])
  }

  return totalMeters
}

function interpolatePoint(start, end, ratio) {
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ]
}

function sampleLinePoints(positions, sampleCount) {
  if (positions.length <= sampleCount) {
    return positions
  }

  const segmentLengths = []
  let totalLength = 0

  for (let index = 1; index < positions.length; index += 1) {
    const length = calculateDistanceInMeters(positions[index - 1], positions[index])
    segmentLengths.push(length)
    totalLength += length
  }

  if (totalLength === 0) {
    return positions.slice(0, sampleCount)
  }

  const sampledPoints = []

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const targetDistance = (totalLength * sampleIndex) / (sampleCount - 1)
    let traversedDistance = 0

    for (let segmentIndex = 0; segmentIndex < segmentLengths.length; segmentIndex += 1) {
      const nextDistance = traversedDistance + segmentLengths[segmentIndex]

      if (targetDistance <= nextDistance || segmentIndex === segmentLengths.length - 1) {
        const segmentLength = segmentLengths[segmentIndex]

        if (segmentLength === 0) {
          sampledPoints.push(positions[segmentIndex])
        } else {
          const ratio = (targetDistance - traversedDistance) / segmentLength
          sampledPoints.push(
            interpolatePoint(positions[segmentIndex], positions[segmentIndex + 1], ratio),
          )
        }

        break
      }

      traversedDistance = nextDistance
    }
  }

  return sampledPoints
}

function classifyGrade(maxGrade) {
  if (maxGrade <= 4) {
    return { label: `${maxGrade.toFixed(1)}%`, color: '#2e8b57', colorClass: 'grade-green' }
  }

  if (maxGrade <= 8) {
    return { label: `${maxGrade.toFixed(1)}%`, color: '#f0b429', colorClass: 'grade-yellow' }
  }

  return { label: `${maxGrade.toFixed(1)}%`, color: '#d95d39', colorClass: 'grade-red' }
}

function buildStreetSegments(elements, center, radiusMeters) {
  return elements
    .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
    .map((element, index) => {
      const positions = element.geometry.map((point) => [point.lat, point.lon])

      if (positions.length < 2) {
        return null
      }

      const segmentLength = calculateSegmentLength(positions)
      const minDistanceToCenter = Math.min(
        ...positions.map((position) => calculateDistanceToCenter(position, center)),
      )

      if (minDistanceToCenter > radiusMeters * 1.15) {
        return null
      }

      return {
        id: element.id,
        order: index,
        street: element.tags?.name || `Unnamed street ${index + 1}`,
        distance: metersToMilesLabel(segmentLength),
        lengthMeters: segmentLength,
        minDistanceToCenter,
        positions,
        grade: 'Calculating...',
        color: '#6d7e75',
        colorClass: 'grade-pending',
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.minDistanceToCenter !== right.minDistanceToCenter) {
        return left.minDistanceToCenter - right.minDistanceToCenter
      }

      return left.lengthMeters - right.lengthMeters
    })
    .slice(0, streetLimit)
}

function applyElevationGrades(segments, elevationsBySegment) {
  return segments.map((segment) => {
    const elevationPoints = elevationsBySegment.get(segment.id) || []

    if (elevationPoints.length < 2) {
      return {
        ...segment,
        grade: 'N/A',
        color: '#7a7a7a',
        colorClass: 'grade-pending',
      }
    }

    let maxGrade = 0

    for (let index = 1; index < elevationPoints.length; index += 1) {
      const previous = elevationPoints[index - 1]
      const current = elevationPoints[index]
      const run = calculateDistanceInMeters(previous.location, current.location)

      if (run === 0) {
        continue
      }

      const rise = Math.abs(current.elevation - previous.elevation)
      const grade = (rise / run) * 100
      maxGrade = Math.max(maxGrade, grade)
    }

    const classification = classifyGrade(maxGrade)

    return {
      ...segment,
      grade: classification.label,
      color: classification.color,
      colorClass: classification.colorClass,
    }
  })
}

async function fetchElevationGrades(segments, signal) {
  const sampledPoints = []
  const pointLookup = []

  segments.forEach((segment) => {
    const samples = sampleLinePoints(segment.positions, elevationSamplesPerSegment)

    samples.forEach((location) => {
      sampledPoints.push(`${location[0]},${location[1]}`)
      pointLookup.push({ segmentId: segment.id, location })
    })
  })

  if (!sampledPoints.length) {
    return segments
  }

  const elevationsBySegment = new Map()
  const batches = []

  for (let index = 0; index < pointLookup.length; index += elevationBatchSize) {
    batches.push(pointLookup.slice(index, index + elevationBatchSize))
  }

  for (const batch of batches) {
    const latitudes = batch.map((point) => point.location[0]).join(',')
    const longitudes = batch.map((point) => point.location[1]).join(',')
    const response = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(latitudes)}&longitude=${encodeURIComponent(longitudes)}`,
      { signal },
    )

    if (!response.ok) {
      throw new Error(`Elevation lookup failed with status ${response.status}.`)
    }

    const data = await response.json()

    ;(data.elevation || []).forEach((elevation, index) => {
      const lookup = batch[index]

      if (!lookup || elevation === null || elevation === undefined) {
        return
      }

      const segmentPoints = elevationsBySegment.get(lookup.segmentId) || []
      segmentPoints.push({
        elevation: Number(elevation),
        location: lookup.location,
      })
      elevationsBySegment.set(lookup.segmentId, segmentPoints)
    })
  }

  return applyElevationGrades(segments, elevationsBySegment)
}

function App() {
  const [addressInput, setAddressInput] = useState(defaultAddress)
  const [selectedAddress, setSelectedAddress] = useState(defaultAddress)
  const [selectedRadius, setSelectedRadius] = useState(radiusOptions[1].label)
  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const [searchState, setSearchState] = useState('idle')
  const [feedback, setFeedback] = useState('Search for an address to recenter the map preview.')
  const [streetFetchState, setStreetFetchState] = useState('idle')
  const [streetFeedback, setStreetFeedback] = useState(
    'Searching the nearby street network for this area.',
  )
  const [nearbySegments, setNearbySegments] = useState([])

  const selectedRadiusOption =
    radiusOptions.find((option) => option.label === selectedRadius) ?? radiusOptions[1]

  useEffect(() => {
    const controller = new AbortController()

    async function fetchNearbyStreets() {
      setStreetFetchState('loading')
      setStreetFeedback('Loading nearby streets and calculating grades...')

      const overpassQuery = `
        [out:json][timeout:25];
        (
          way["highway"](around:${selectedRadiusOption.meters},${mapCenter[0]},${mapCenter[1]});
        );
        out geom tags qt;
      `

      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: overpassQuery,
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Street network lookup failed.')
        }

        const data = await response.json()
        const segments = buildStreetSegments(
          data.elements || [],
          mapCenter,
          selectedRadiusOption.meters,
        )

        if (!segments.length) {
          setNearbySegments([])
          setStreetFetchState('error')
          setStreetFeedback('No nearby streets were returned for this area yet.')
          return
        }

        setNearbySegments(segments)
        setStreetFetchState('loading')
        setStreetFeedback(
          `Loaded ${segments.length} street segments. Calculating elevation-based grades...`,
        )

        try {
          const gradedSegments = await fetchElevationGrades(segments, controller.signal)

          setNearbySegments(gradedSegments)
          setStreetFetchState('success')
          setStreetFeedback(
            `Showing ${gradedSegments.length} nearby street segments with computed grade estimates.`,
          )
        } catch (error) {
          if (error.name === 'AbortError') {
            return
          }

          setNearbySegments(segments)
          setStreetFetchState('error')
          setStreetFeedback(
            `Loaded street geometry, but grade calculation failed: ${error.message}`,
          )
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setNearbySegments([])
        setStreetFetchState('error')
        setStreetFeedback(`Street lookup failed: ${error.message}`)
      }
    }

    fetchNearbyStreets()

    return () => controller.abort()
  }, [mapCenter, selectedRadiusOption])

  async function handleSearch(event) {
    event.preventDefault()

    const query = addressInput.trim()

    if (!query) {
      setSearchState('error')
      setFeedback('Enter an address or landmark before previewing street grades.')
      return
    }

    setSearchState('loading')
    setFeedback(`Looking up "${query}"...`)

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      )

      if (!response.ok) {
        throw new Error('Address lookup failed.')
      }

      const results = await response.json()

      if (!results.length) {
        setSearchState('error')
        setFeedback(`No result found for "${query}". Try a more specific address.`)
        return
      }

      const match = results[0]
      const nextCenter = [Number(match.lat), Number(match.lon)]

      setMapCenter(nextCenter)
      setSelectedAddress(match.display_name)
      setSearchState('success')
      setFeedback(`Showing a ${selectedRadiusOption.label} preview around ${match.display_name}.`)
    } catch {
      setSearchState('error')
      setFeedback('Address lookup is unavailable right now. Try again in a moment.')
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Accessibility Map</p>
          <h1>See street steepness around any address before you head out.</h1>
          <p className="hero-text">
            Search a place, choose a radius, and preview nearby streets with
            grade-based colors designed to be easy to scan.
          </p>
        </div>

        <form className="search-card" onSubmit={handleSearch}>
          <label className="field-group">
            <span className="field-label">Address</span>
            <input
              className="text-input"
              type="text"
              placeholder="Enter an address or landmark"
              aria-label="Address"
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
            />
          </label>

          <label className="field-group">
            <span className="field-label">Radius</span>
            <select
              className="select-input"
              value={selectedRadius}
              aria-label="Radius"
              onChange={(event) => setSelectedRadius(event.target.value)}
            >
              {radiusOptions.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button" type="submit" disabled={searchState === 'loading'}>
            {searchState === 'loading' ? 'Finding address...' : 'Preview street grades'}
          </button>

          <p className={`search-note search-note-${searchState}`} aria-live="polite">
            {feedback}
          </p>
        </form>
      </section>

      <section className="workspace">
        <div className="map-card">
          <div className="map-card-header">
            <div>
              <p className="section-label">Map Preview</p>
              <h2>Color-coded streets around the selected address</h2>
            </div>
            <div className="legend" aria-label="Grade legend">
              {gradeBands.map((band) => (
                <div className="legend-item" key={band.label}>
                  <span className={band.colorClass} aria-hidden="true" />
                  <span>
                    {band.label} <strong>{band.range}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className={`map-status map-status-${streetFetchState}`} aria-live="polite">
            {streetFeedback}
          </p>

          <div className="map-frame">
            <MapContainer
              center={mapCenter}
              zoom={15}
              scrollWheelZoom
              className="leaflet-map"
            >
              <RecenterMap center={mapCenter} />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Circle
                center={mapCenter}
                radius={selectedRadiusOption.meters}
                pathOptions={{
                  color: '#315641',
                  fillColor: '#6ba77e',
                  fillOpacity: 0.08,
                  weight: 2,
                  dashArray: '6 6',
                }}
              />

              <Marker position={mapCenter}>
                <Popup>
                  <strong>{selectedAddress}</strong>
                  <br />
                  Radius: {selectedRadiusOption.label}
                </Popup>
              </Marker>

              {nearbySegments.map((segment) => (
                <Polyline
                  key={segment.id}
                  positions={segment.positions}
                  pathOptions={{ color: segment.color, weight: 6, lineCap: 'round' }}
                >
                  <Popup>
                    <strong>{segment.street}</strong>
                    <br />
                    Estimated max grade: {segment.grade}
                    <br />
                    Segment length: {segment.distance}
                  </Popup>
                </Polyline>
              ))}
            </MapContainer>

            <div className="map-pill map-pill-top">Selected address</div>
            <div className="map-pill map-pill-bottom">{selectedRadiusOption.label} radius</div>
          </div>
        </div>

        <aside className="insight-card">
          <div>
            <p className="section-label">Nearby Streets</p>
            <h2>Real nearby street geometry with estimated elevation grades</h2>
          </div>

          <ul className="segment-list">
            {nearbySegments.slice(0, 8).map((segment) => (
              <li className="segment-item" key={segment.id}>
                <div>
                  <p className="segment-name">{segment.street}</p>
                  <p className="segment-meta">{segment.distance} segment length</p>
                </div>
                <div className="segment-grade">
                  <span className={`grade ${segment.colorClass}`} aria-hidden="true" />
                  <strong>{segment.grade}</strong>
                </div>
              </li>
            ))}
          </ul>

          <div className="checklist">
            <p className="section-label">V1 Focus</p>
            <ul>
              <li>Address search with simple radius controls</li>
              <li>Real nearby streets from OpenStreetMap</li>
              <li>Grades estimated from sampled elevation points</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
