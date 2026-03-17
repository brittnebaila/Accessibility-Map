import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet'
import './App.css'

const gradeBands = [
  { label: 'Easy', range: '0% to 4%', colorClass: 'grade grade-green' },
  { label: 'Moderate', range: '4% to 8%', colorClass: 'grade grade-yellow' },
  { label: 'Steep', range: '8%+', colorClass: 'grade grade-red' },
]

const nearbySegments = [
  { street: 'Maple Ave', distance: '0.1 mi', grade: '2.8%', colorClass: 'grade-green' },
  { street: 'Grant St', distance: '0.2 mi', grade: '6.1%', colorClass: 'grade-yellow' },
  { street: 'Cedar Hill Rd', distance: '0.3 mi', grade: '9.4%', colorClass: 'grade-red' },
]

const mapCenter = [37.7749, -122.4194]

const sampleStreetGrades = [
  {
    street: 'Maple Ave',
    grade: '2.8%',
    color: '#2e8b57',
    positions: [
      [37.7761, -122.4235],
      [37.7754, -122.4219],
      [37.7747, -122.4198],
      [37.7738, -122.4177],
    ],
  },
  {
    street: 'Grant St',
    grade: '6.1%',
    color: '#f0b429',
    positions: [
      [37.7775, -122.4168],
      [37.7763, -122.4176],
      [37.7748, -122.4186],
      [37.7736, -122.4192],
    ],
  },
  {
    street: 'Cedar Hill Rd',
    grade: '9.4%',
    color: '#d95d39',
    positions: [
      [37.7724, -122.4237],
      [37.7732, -122.4218],
      [37.7742, -122.4197],
      [37.7751, -122.4179],
    ],
  },
]

function App() {
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

        <form className="search-card">
          <label className="field-group">
            <span className="field-label">Address</span>
            <input
              className="text-input"
              type="text"
              placeholder="Enter an address or landmark"
              aria-label="Address"
            />
          </label>

          <label className="field-group">
            <span className="field-label">Radius</span>
            <select className="select-input" defaultValue="0.5 miles" aria-label="Radius">
              <option>0.25 miles</option>
              <option>0.5 miles</option>
              <option>1 mile</option>
            </select>
          </label>

          <button className="primary-button" type="button">
            Preview street grades
          </button>

          <p className="search-note">
            First version: web-first, responsive, and focused on a fast visual
            read of nearby terrain.
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
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={mapCenter}>
                <Popup>
                  Selected address
                  <br />
                  Street grades will radiate from here.
                </Popup>
              </Marker>

              {sampleStreetGrades.map((segment) => (
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
            <div className="map-pill map-pill-bottom">Sample street grades</div>
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
