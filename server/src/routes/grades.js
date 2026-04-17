import { fetchElevationGrades } from '../services/elevation.js'
import { fetchNearbyStreetSegments } from '../services/streets.js'

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

  const segments = await fetchNearbyStreetSegments([lat, lng], radius)

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

    return {
      statusCode: 200,
      payload: {
        segments: gradedSegments,
        streetStatus: 'success',
        streetMessage: `Showing ${gradedSegments.length} nearby street segments with computed grade estimates.`,
      },
    }
  } catch (error) {
    return {
      statusCode: 200,
      payload: {
        segments,
        streetStatus: 'error',
        streetMessage: `Loaded street geometry, but grade calculation failed: ${error.message}`,
      },
    }
  }
}
