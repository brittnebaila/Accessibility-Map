import { fetchPlaceSuggestions } from '../services/geocoder.js'

export async function handleSearchRoute(url) {
  const query = url.searchParams.get('q')?.trim()

  if (!query) {
    return {
      statusCode: 400,
      payload: { error: 'Missing required query parameter: q.' },
    }
  }

  const suggestions = await fetchPlaceSuggestions(query)

  return {
    statusCode: 200,
    payload: { suggestions },
  }
}
