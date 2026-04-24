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

async function fetchSuggestions(query, signal) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Suggestion lookup failed.')
  }

  return data.suggestions || []
}

async function fetchGrades(lat, lng, radius, signal) {
  const response = await fetch(
    `/api/grades?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`,
    { signal },
  )
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Street grade lookup failed.')
  }

  return data
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
  const [suggestions, setSuggestions] = useState([])
  const [suggestionState, setSuggestionState] = useState('idle')
  const [suggestionMessage, setSuggestionMessage] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const selectedRadiusOption =
    radiusOptions.find((option) => option.label === selectedRadius) ?? radiusOptions[1]

  useEffect(() => {
    if (addressInput.trim().length < 3 || selectedSuggestion?.label === addressInput.trim()) {
      setSuggestions([])
      setSuggestionState('idle')
      setSuggestionMessage('')
      return undefined
    }

    const controller = new AbortController()
    const timerId = window.setTimeout(async () => {
      setSuggestionState('loading')

      try {
        const nextSuggestions = await fetchSuggestions(addressInput.trim(), controller.signal)
        setSuggestions(nextSuggestions)
        setShowSuggestions(true)
        setSuggestionState(nextSuggestions.length ? 'success' : 'idle')
        setSuggestionMessage(nextSuggestions.length ? '' : 'No matching suggestions yet.')
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setSuggestions([])
        setSuggestionState('error')
        setSuggestionMessage('Could not load suggestions right now.')
      }
    }, 300)

    return () => {
      controller.abort()
      window.clearTimeout(timerId)
    }
  }, [addressInput, selectedSuggestion])

  useEffect(() => {
    const controller = new AbortController()

    async function loadGrades() {
      setStreetFetchState('loading')
      setStreetFeedback('Loading nearby streets and calculating grades...')

      try {
        const data = await fetchGrades(
          mapCenter[0],
          mapCenter[1],
          selectedRadiusOption.meters,
          controller.signal,
        )

        setNearbySegments(data.segments || [])
        setStreetFetchState(data.streetStatus || 'success')
        setStreetFeedback(
          data.streetMessage || 'Showing nearby street segments with computed grade estimates.',
        )
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setNearbySegments([])
        setStreetFetchState('error')
        setStreetFeedback(error.message)
      }
    }

    loadGrades()

    return () => controller.abort()
  }, [mapCenter, selectedRadiusOption])

  function applySelectedLocation(location) {
    setAddressInput(location.label)
    setSelectedAddress(location.label)
    setSelectedSuggestion(location)
    setMapCenter([location.lat, location.lon])
    setShowSuggestions(false)
    setSuggestions([])
    setSuggestionMessage('')
    setSearchState('success')
    setFeedback(`Showing a ${selectedRadiusOption.label} preview around ${location.label}.`)
  }

  async function handleSearch(event) {
    event.preventDefault()

    const query = addressInput.trim()

    if (!query) {
      setSearchState('error')
      setFeedback('Enter an address or landmark before previewing street grades.')
      return
    }

    const exactSuggestion = suggestions.find((suggestion) => suggestion.label === query)

    if (exactSuggestion) {
      applySelectedLocation(exactSuggestion)
      return
    }

    setSearchState('loading')
    setFeedback(`Looking up "${query}"...`)

    try {
      const nextSuggestions = await fetchSuggestions(query)

      if (!nextSuggestions.length) {
        setSearchState('error')
        setFeedback(`No result found for "${query}". Try a more specific address.`)
        return
      }

      applySelectedLocation(nextSuggestions[0])
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
            <div className="autocomplete">
              <input
                className="text-input"
                type="text"
                placeholder="Enter an address or landmark"
                aria-label="Address"
                aria-expanded={showSuggestions && suggestions.length > 0}
                aria-autocomplete="list"
                value={addressInput}
                onChange={(event) => {
                  setAddressInput(event.target.value)
                  setSelectedSuggestion(null)
                  setShowSuggestions(true)
                }}
                onFocus={() => {
                  if (suggestions.length) {
                    setShowSuggestions(true)
                  }
                }}
              />

              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestion-list" role="listbox" aria-label="Address suggestions">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.id}>
                      <button
                        className="suggestion-item"
                        type="button"
                        onClick={() => applySelectedLocation(suggestion)}
                      >
                        {suggestion.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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

          {suggestionState === 'loading' && (
            <p className="suggestion-note" aria-live="polite">
              Looking up address suggestions...
            </p>
          )}

          {suggestionState !== 'loading' && suggestionMessage && (
            <p
              className={`suggestion-note ${
                suggestionState === 'error' ? 'suggestion-note-error' : ''
              }`}
              aria-live="polite"
            >
              {suggestionMessage}
            </p>
          )}
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
              <li>Address search with backend autocomplete</li>
              <li>Backend street and elevation pipeline</li>
              <li>Cleaner street naming from the API layer</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
