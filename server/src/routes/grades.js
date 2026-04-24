import { fetchElevationGrades } from '../services/elevation.js'
import {
  buildEmergencyStreetFallback,
  fetchNearbyStreetSegments,
} from '../services/streets.js'
import { getCacheEntry, setCacheEntry } from '../utils/cache.js'

const gradesCacheNamespace = 'grades'
const gradesCacheTtlMs = 12 * 60 * 60 * 1000

function buildGradesCacheKey(lat, lng, radius) {
  return `${lat.toFixed(5)}:${lng.toFixed(5)}:${Math.round(radius)}`
}

export async function handleGradesRoute(url) {
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  const radius = Number(url.searchParams.get('radius'))

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
    return {
      statusCode: 400,
      payload: { error: 'Missing or invalid lat, lng, or radius parameter.' },
    }
  }

  const cacheKey = buildGradesCacheKey(lat, lng, radius)
  const cachedPayload = await getCacheEntry(gradesCacheNamespace, cacheKey)

  if (cachedPayload) {
    return {
      statusCode: 200,
      payload: {
        ...cachedPayload,
        streetMessage: `Showing cached street grades from a recent lookup. ${cachedPayload.streetMessage}`,
      },
    }
  }

  try {
    const streetResult = await fetchNearbyStreetSegments([lat, lng], radius)
    const { message: streetMessage, segments } = streetResult

    if (!segments.length) {
      return {
        statusCode: 200,
        payload: {
          segments: [],
          streetStatus: 'error',
          streetMessage: 'No nearby streets were returned for this area yet.',
        },
      }
    }

    try {
      const gradedSegments = await fetchElevationGrades(segments)
      const payload = {
        segments: gradedSegments,
        streetStatus: 'success',
        streetMessage,
      }

      await setCacheEntry(gradesCacheNamespace, cacheKey, payload, gradesCacheTtlMs)

      return {
        statusCode: 200,
        payload,
      }
    } catch (error) {
      const payload = {
        segments,
        streetStatus: 'error',
        streetMessage: `Loaded street geometry, but grade calculation failed: ${error.message}`,
      }

      await setCacheEntry(gradesCacheNamespace, cacheKey, payload, gradesCacheTtlMs)

      return {
        statusCode: 200,
        payload,
      }
    }
  } catch (error) {
    const stalePayload = await getCacheEntry(gradesCacheNamespace, cacheKey, {
      allowStale: true,
    })

    if (stalePayload) {
      return {
        statusCode: 200,
        payload: {
          ...stalePayload,
          streetStatus: 'error',
          streetMessage: `Using cached street data because live lookup failed: ${error.message}`,
        },
      }
    }

    const fallbackPayload = buildEmergencyStreetFallback([lat, lng], radius)

    return {
      statusCode: 200,
      payload: {
        segments: fallbackPayload.segments,
        streetStatus: 'error',
        streetMessage: `${fallbackPayload.message} Live lookup failed: ${error.message}`,
      },
    }
  }
}
