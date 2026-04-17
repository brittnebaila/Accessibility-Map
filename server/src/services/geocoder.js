const suggestionLimit = 5

export async function fetchPlaceSuggestions(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${suggestionLimit}&addressdetails=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Suggestion lookup failed with status ${response.status}.`)
  }

  const results = await response.json()

  return results.map((result) => ({
    id: result.place_id,
    label: result.display_name,
    lat: Number(result.lat),
    lon: Number(result.lon),
  }))
}
