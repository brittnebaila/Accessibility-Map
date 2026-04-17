import {
  applyElevationGrades,
  sampleLinePoints,
} from './gradeCalculator.js'

const elevationSamplesPerSegment = 4
const elevationBatchSize = 40

export async function fetchElevationGrades(segments) {
  const pointLookup = []

  segments.forEach((segment) => {
    const samples = sampleLinePoints(segment.positions, elevationSamplesPerSegment)

    samples.forEach((location) => {
      pointLookup.push({ segmentId: segment.id, location })
    })
  })

  if (!pointLookup.length) {
    return segments
  }

  const elevationsBySegment = new Map()

  for (let index = 0; index < pointLookup.length; index += elevationBatchSize) {
    const batch = pointLookup.slice(index, index + elevationBatchSize)
    const latitudes = batch.map((point) => point.location[0]).join(',')
    const longitudes = batch.map((point) => point.location[1]).join(',')

    const response = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(latitudes)}&longitude=${encodeURIComponent(longitudes)}`,
    )

    if (!response.ok) {
      throw new Error(`Elevation lookup failed with status ${response.status}.`)
    }

    const data = await response.json()

    ;(data.elevation || []).forEach((elevation, batchIndex) => {
      const lookup = batch[batchIndex]

      if (!lookup || elevation === null || elevation === undefined) {
        return
      }

      const segmentPoints = elevationsBySegment.get(lookup.segmentId) || []
      segmentPoints.push({
        elevation: Number(elevation),
        location: lookup.location,
      })
      elevationsBySegment.set(lookup.segmentId, segmentPoints)
    })
  }

  return applyElevationGrades(segments, elevationsBySegment)
}
