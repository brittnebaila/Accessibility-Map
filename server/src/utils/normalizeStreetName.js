const highwayTypeLabels = {
  cycleway: 'cycleway',
  footway: 'footpath',
  living_street: 'living street',
  path: 'path',
  pedestrian: 'pedestrian street',
  residential: 'residential street',
  secondary: 'secondary road',
  secondary_link: 'secondary link',
  service: 'service road',
  tertiary: 'tertiary road',
  tertiary_link: 'tertiary link',
  track: 'track',
  trunk: 'trunk road',
  trunk_link: 'trunk link',
  unclassified: 'local road',
}

function firstTagValue(tags, keys) {
  for (const key of keys) {
    const value = tags[key]

    if (value) {
      return value
    }
  }

  return null
}

export function normalizeStreetName(tags = {}) {
  const namedValue = firstTagValue(tags, [
    'name',
    'official_name',
    'alt_name',
    'short_name',
    'loc_name',
  ])

  if (namedValue) {
    return namedValue
  }

  const routeValue = firstTagValue(tags, ['ref', 'nat_ref', 'int_ref', 'destination:ref'])

  if (routeValue) {
    return routeValue
  }

  if (tags.junction) {
    return `${tags.junction} junction`
  }

  const highwayType = tags.highway
  const surface = tags.surface
  const access = tags.access
  const service = tags.service

  if (highwayType && highwayTypeLabels[highwayType]) {
    if (service) {
      return `${highwayTypeLabels[highwayType]} (${service.replaceAll('_', ' ')})`
    }

    if (surface && highwayType === 'path') {
      return `${surface.replaceAll('_', ' ')} path`
    }

    if (access === 'private') {
      return `Private ${highwayTypeLabels[highwayType]}`
    }

    return `Unnamed ${highwayTypeLabels[highwayType]}`
  }

  return 'Unnamed local street'
}
