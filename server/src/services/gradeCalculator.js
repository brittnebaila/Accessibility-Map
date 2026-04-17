export function calculateDistanceInMeters(start, end) {
  const latDistance = (end[0] - start[0]) * 111320
  const averageLatitude = ((start[0] + end[0]) / 2) * (Math.PI / 180)
  const lngDistance = (end[1] - start[1]) * 111320 * Math.cos(averageLatitude)

  return Math.hypot(latDistance, lngDistance)
}

export function metersToMilesLabel(meters) {
  return `${(meters / 1609.34).toFixed(1)} mi`
}

export function calculateSegmentLength(positions) {
  let totalMeters = 0

  for (let index = 1; index < positions.length; index += 1) {
    totalMeters += calculateDistanceInMeters(positions[index - 1], positions[index])
  }

  return totalMeters
}

function interpolatePoint(start, end, ratio) {
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ]
}

export function sampleLinePoints(positions, sampleCount) {
  if (positions.length <= sampleCount) {
    return positions
  }

  const segmentLengths = []
  let totalLength = 0

  for (let index = 1; index < positions.length; index += 1) {
    const length = calculateDistanceInMeters(positions[index - 1], positions[index])
    segmentLengths.push(length)
    totalLength += length
  }

  if (totalLength === 0) {
    return positions.slice(0, sampleCount)
  }

  const sampledPoints = []

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const targetDistance = (totalLength * sampleIndex) / (sampleCount - 1)
    let traversedDistance = 0

    for (let segmentIndex = 0; segmentIndex < segmentLengths.length; segmentIndex += 1) {
      const nextDistance = traversedDistance + segmentLengths[segmentIndex]

      if (targetDistance <= nextDistance || segmentIndex === segmentLengths.length - 1) {
        const segmentLength = segmentLengths[segmentIndex]

        if (segmentLength === 0) {
          sampledPoints.push(positions[segmentIndex])
        } else {
          const ratio = (targetDistance - traversedDistance) / segmentLength
          sampledPoints.push(
            interpolatePoint(positions[segmentIndex], positions[segmentIndex + 1], ratio),
          )
        }

        break
      }

      traversedDistance = nextDistance
    }
  }

  return sampledPoints
}

export function classifyGrade(maxGrade) {
  if (maxGrade <= 4) {
    return { label: `${maxGrade.toFixed(1)}%`, color: '#2e8b57', colorClass: 'grade-green' }
  }

  if (maxGrade <= 8) {
    return { label: `${maxGrade.toFixed(1)}%`, color: '#f0b429', colorClass: 'grade-yellow' }
  }

  return { label: `${maxGrade.toFixed(1)}%`, color: '#d95d39', colorClass: 'grade-red' }
}

export function applyElevationGrades(segments, elevationsBySegment) {
  return segments.map((segment) => {
    const elevationPoints = elevationsBySegment.get(segment.id) || []

    if (elevationPoints.length < 2) {
      return {
        ...segment,
        grade: 'N/A',
        color: '#7a7a7a',
        colorClass: 'grade-pending',
      }
    }

    let maxGrade = 0

    for (let index = 1; index < elevationPoints.length; index += 1) {
      const previous = elevationPoints[index - 1]
      const current = elevationPoints[index]
      const run = calculateDistanceInMeters(previous.location, current.location)

      if (run === 0) {
        continue
      }

      const rise = Math.abs(current.elevation - previous.elevation)
      const grade = (rise / run) * 100
      maxGrade = Math.max(maxGrade, grade)
    }

    const classification = classifyGrade(maxGrade)

    return {
      ...segment,
      grade: classification.label,
      color: classification.color,
      colorClass: classification.colorClass,
    }
  })
}
