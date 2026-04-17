const highwayTypeLabels = {
  cycleway: 'Cycleway',
  footway: 'Footpath',
  living_street: 'Living street',
  path: 'Path',
  pedestrian: 'Pedestrian street',
  residential: 'Residential street',
  secondary: 'Secondary road',
  secondary_link: 'Secondary link',
  service: 'Service road',
  tertiary: 'Tertiary road',
  tertiary_link: 'Tertiary link',
  track: 'Track',
  trunk: 'Trunk road',
  trunk_link: 'Trunk link',
  unclassified: 'Local road',
}

export function normalizeStreetName(tags = {}) {
  if (tags.name) {
    return tags.name
  }

  if (tags.ref) {
    return tags.ref
  }

  const highwayType = tags.highway

  if (highwayType && highwayTypeLabels[highwayType]) {
    return `Unnamed ${highwayTypeLabels[highwayType].toLowerCase()}`
  }

  return 'Unnamed local street'
}
