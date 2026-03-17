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

function getMockGradeDetails(index) {
  const palette = [
    { grade: '2.8%', color: '#2e8b57', colorClass: 'grade-green' },
    { grade: '6.1%', color: '#f0b429', colorClass: 'grade-yellow' },
    { grade: '9.4%', color: '#d95d39', colorClass: 'grade-red' },
  ]

  return palette[index % palette.length]
}

function metersToMilesLabel(meters) {
  return `${(meters / 1609.34).toFixed(1)} mi`
}

function calculateSegmentLength(geometry) {
  let totalMeters = 0

  for (let index = 1; index < geometry.length; index += 1) {
    const previous = geometry[index - 1]
    const current = geometry[index]
    const latDistance = (current.lat - previous.lat) * 111320
    const averageLatitude = ((current.lat + previous.lat) / 2) * (Math.PI / 180)
    const lngDistance = (current.lon - previous.lon) * 111320 * Math.cos(averageLatitude)

    totalMeters += Math.hypot(latDistance, lngDistance)
  }

  return totalMeters
}

function buildStreetSegments(elements) {
  return elements
    .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
    .slice(0, 60)
    .map((element, index) => {
      const gradeDetails = getMockGradeDetails(index)
      const segmentLength = calculateSegmentLength(element.geometry)

      return {
        id: element.id,
        street: element.tags?.name || `Unnamed street ${index + 1}`,
        distance: metersToMilesLabel(segmentLength),
        grade: gradeDetails.grade,
        color: gradeDetails.color,
        colorClass: gradeDetails.colorClass,
        positions: element.geometry.map((point) => [point.lat, point.lon]),
      }
    })
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
      setStreetFeedback('Loading real street segments in the selected radius...')

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
        const segments = buildStreetSegments(data.elements || [])

        if (!segments.length) {
          setNearbySegments([])
          setStreetFetchState('error')
          setStreetFeedback('No nearby streets were returned for this area yet.')
          return
        }

        setNearbySegments(segments)
        setStreetFetchState('success')
        setStreetFeedback(
          `Showing ${segments.length} nearby street segments within ${selectedRadiusOption.label}.`,
        )
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setNearbySegments([])
        setStreetFetchState('error')
        setStreetFeedback('Street data is unavailable right now. Try the search again in a moment.')
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
                    Temporary grade preview: {segment.grade}
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
            <h2>Real nearby street geometry with temporary color buckets</h2>
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
              <li>Placeholder colors now, real elevation grades next</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
