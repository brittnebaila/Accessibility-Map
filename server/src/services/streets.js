import {
  calculateDistanceInMeters,
  calculateSegmentLength,
  metersToMilesLabel,
} from './gradeCalculator.js'
import { normalizeStreetName } from '../utils/normalizeStreetName.js'

const streetLimit = 80
const preferredHighwayTypes = [
  'cycleway',
  'footway',
  'living_street',
  'path',
  'pedestrian',
  'residential',
  'secondary',
  'secondary_link',
  'service',
  'tertiary',
  'tertiary_link',
  'track',
  'unclassified',
]
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
  const requestBody = new URLSearchParams({ data: overpassQuery }).toString()

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'StreetEase/0.1 (development contact: local-app)',
        },
        body: requestBody,
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

function buildOverpassQuery(center, radiusMeters, timeoutSeconds) {
  const highwayFilter = preferredHighwayTypes
    .map((highwayType) => `way["highway"="${highwayType}"](around:${radiusMeters},${center[0]},${center[1]});`)
    .join('\n')

  return `
    [out:json][timeout:${timeoutSeconds}];
    (
      ${highwayFilter}
    );
    out geom tags qt;
  `
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

function offsetPoint(center, latOffset, lngOffset) {
  return [center[0] + latOffset, center[1] + lngOffset]
}

function buildFallbackSegments(center, radiusMeters) {
  const scale = Math.max(radiusMeters / 805, 0.5)
  const latStep = 0.0014 * scale
  const lngStep = 0.0019 * scale

  return [
    {
      id: 'fallback-1',
      street: 'Fallback nearby street',
      distance: metersToMilesLabel(radiusMeters * 0.32),
      lengthMeters: radiusMeters * 0.32,
      minDistanceToCenter: radiusMeters * 0.1,
      positions: [
        offsetPoint(center, latStep, -lngStep),
        offsetPoint(center, latStep * 0.4, -lngStep * 0.2),
        offsetPoint(center, -latStep * 0.2, lngStep * 0.9),
      ],
      grade: 'N/A',
      color: '#7a7a7a',
      colorClass: 'grade-pending',
    },
    {
      id: 'fallback-2',
      street: 'Fallback cross street',
      distance: metersToMilesLabel(radiusMeters * 0.28),
      lengthMeters: radiusMeters * 0.28,
      minDistanceToCenter: radiusMeters * 0.12,
      positions: [
        offsetPoint(center, -latStep * 1.1, -lngStep * 0.6),
        offsetPoint(center, -latStep * 0.2, -lngStep * 0.1),
        offsetPoint(center, latStep * 0.9, lngStep * 0.5),
      ],
      grade: 'N/A',
      color: '#7a7a7a',
      colorClass: 'grade-pending',
    },
    {
      id: 'fallback-3',
      street: 'Fallback path',
      distance: metersToMilesLabel(radiusMeters * 0.22),
      lengthMeters: radiusMeters * 0.22,
      minDistanceToCenter: radiusMeters * 0.08,
      positions: [
        offsetPoint(center, -latStep * 0.9, lngStep * 0.8),
        offsetPoint(center, 0, 0),
        offsetPoint(center, latStep * 1.1, -lngStep * 0.5),
      ],
      grade: 'N/A',
      color: '#7a7a7a',
      colorClass: 'grade-pending',
    },
  ]
}

export async function fetchNearbyStreetSegments(center, radiusMeters) {
  const attempts = [
    { radiusMeters, timeoutSeconds: 18, message: null },
    {
      radiusMeters: Math.max(Math.round(radiusMeters * 0.75), 200),
      timeoutSeconds: 12,
      message: 'Street network servers timed out, so the map is showing a tighter nearby area.',
    },
  ]

  let lastError = null

  for (const attempt of attempts) {
    try {
      const data = await fetchStreetNetwork(
        buildOverpassQuery(center, attempt.radiusMeters, attempt.timeoutSeconds),
      )
      const segments = buildStreetSegments(data.elements || [], center, attempt.radiusMeters)

      if (segments.length) {
        return {
          segments,
          message:
            attempt.message ||
            `Showing ${segments.length} nearby street segments with computed grade estimates.`,
        }
      }
    } catch (error) {
      lastError = error

      if (!String(error.message || '').includes('504')) {
        break
      }
    }
  }

  throw lastError || new Error('Street network lookup failed on all map data servers.')
}

export function buildEmergencyStreetFallback(center, radiusMeters) {
  return {
    segments: buildFallbackSegments(center, radiusMeters),
    message:
      'Live street providers are unavailable right now. Showing fallback demo segments near the selected point.',
  }
}
