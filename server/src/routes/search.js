import { fetchPlaceSuggestions } from '../services/geocoder.js'
import { getCacheEntry, setCacheEntry } from '../utils/cache.js'

const searchCacheNamespace = 'search'
const searchCacheTtlMs = 12 * 60 * 60 * 1000

export async function handleSearchRoute(url) {
  const query = url.searchParams.get('q')?.trim()

  if (!query) {
    return {
      statusCode: 400,
      payload: { error: 'Missing required query parameter: q.' },
    }
  }

  const cacheKey = query.toLowerCase()
  const cachedSuggestions = await getCacheEntry(searchCacheNamespace, cacheKey)

  if (cachedSuggestions) {
    return {
      statusCode: 200,
      payload: { suggestions: cachedSuggestions },
    }
  }

  try {
    const suggestions = await fetchPlaceSuggestions(query)
    await setCacheEntry(searchCacheNamespace, cacheKey, suggestions, searchCacheTtlMs)

    return {
      statusCode: 200,
      payload: { suggestions },
    }
  } catch (error) {
    const staleSuggestions = await getCacheEntry(searchCacheNamespace, cacheKey, {
      allowStale: true,
    })

    if (staleSuggestions) {
      return {
        statusCode: 200,
        payload: { suggestions: staleSuggestions },
      }
    }

    throw error
  }
}
