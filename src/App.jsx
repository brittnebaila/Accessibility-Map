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

const streetTemplates = [
  {
    street: 'Maple Ave',
    grade: '2.8%',
    distance: '0.1 mi',
    color: '#2e8b57',
    colorClass: 'grade-green',
    offsets: [
      [0.0012, -0.0034],
      [0.0005, -0.0018],
      [-0.0002, 0.0003],
      [-0.0011, 0.0024],
    ],
  },
  {
    street: 'Grant St',
    grade: '6.1%',
    distance: '0.2 mi',
    color: '#f0b429',
    colorClass: 'grade-yellow',
    offsets: [
      [0.0026, 0.0022],
      [0.0014, 0.0012],
      [-0.0001, 0.0002],
      [-0.0013, -0.0004],
    ],
  },
  {
    street: 'Cedar Hill Rd',
    grade: '9.4%',
    distance: '0.3 mi',
    color: '#d95d39',
    colorClass: 'grade-red',
    offsets: [
      [-0.0025, -0.0036],
      [-0.0017, -0.0017],
      [-0.0007, 0.0004],
      [0.0003, 0.0022],
    ],
  },
]

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

function shiftSegments(center) {
  return streetTemplates.map((segment) => ({
    ...segment,
    positions: segment.offsets.map(([latOffset, lngOffset]) => [
      center[0] + latOffset,
      center[1] + lngOffset,
    ]),
  }))
}

function App() {
  const [addressInput, setAddressInput] = useState(defaultAddress)
  const [selectedAddress, setSelectedAddress] = useState(defaultAddress)
  const [selectedRadius, setSelectedRadius] = useState(radiusOptions[1].label)
  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const [searchState, setSearchState] = useState('idle')
  const [feedback, setFeedback] = useState('Search for an address to recenter the map preview.')

  const selectedRadiusOption =
    radiusOptions.find((option) => option.label === selectedRadius) ?? radiusOptions[1]

  const nearbySegments = shiftSegments(mapCenter)

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
                  key={segment.street}
                  positions={segment.positions}
                  pathOptions={{ color: segment.color, weight: 8, lineCap: 'round' }}
                >
                  <Popup>
                    <strong>{segment.street}</strong>
                    <br />
                    Estimated grade: {segment.grade}
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
            <p className="section-label">Nearby Sample</p>
            <h2>What the first experience should communicate</h2>
          </div>

          <ul className="segment-list">
            {nearbySegments.map((segment) => (
              <li className="segment-item" key={segment.street}>
                <div>
                  <p className="segment-name">{segment.street}</p>
                  <p className="segment-meta">{segment.distance} away</p>
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
              <li>Responsive map-first layout for web</li>
              <li>Clear grade colors and an easy legend</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
