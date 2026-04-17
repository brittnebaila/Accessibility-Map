import {
  calculateDistanceInMeters,
  calculateSegmentLength,
  metersToMilesLabel,
} from './gradeCalculator.js'
import { normalizeStreetName } from '../utils/normalizeStreetName.js'

const streetLimit = 80
const overpassEndpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

function calculateDistanceToCenter(position, center) {
  return calculateDistanceInMeters(position, center)
}

async function fetchStreetNetwork(overpassQuery) {
  let lastError = null

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: overpassQuery,
      })

      if (!response.ok) {
        lastError = new Error(`Street network lookup failed with status ${response.status}.`)
        continue
      }

      return await response.json()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Street network lookup failed on all map data servers.')
}

function buildStreetSegments(elements, center, radiusMeters) {
  return elements
    .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
    .map((element) => {
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
        street: normalizeStreetName(element.tags),
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

export async function fetchNearbyStreetSegments(center, radiusMeters) {
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way["highway"](around:${radiusMeters},${center[0]},${center[1]});
    );
    out geom tags qt;
  `

  const data = await fetchStreetNetwork(overpassQuery)
  return buildStreetSegments(data.elements || [], center, radiusMeters)
}
