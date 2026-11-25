/** Municipalities on Fyn (content/fyn.geojson). Names are i18n keys `municipality.<id>.name`. */
export const MUNICIPALITIES = [
  'odense',
  'middelfart',
  'nordfyns',
  'kerteminde',
  'assens',
  'nyborg',
  'faaborg_midtfyn',
  'svendborg',
  'aeroe',
  'langeland',
] as const;
export type MunicipalityId = (typeof MUNICIPALITIES)[number];
/** Municipalities whose region can be inspected today (P22: Odense is the first region). */
export const PLAYABLE_MUNICIPALITIES: readonly MunicipalityId[] = ['odense'];

/**
 * Map frame per region (D172, owner request): the region's bounding box plus an even 2 km
 * margin, [west, south, east, north]. The basemap extract takes every tile inside it at the
 * Town Map's zoom levels, and the Town Map paints a plain surround outside it, so the map
 * ends in a clean, even edge. Checked against the boundary by tools/region-builder tests.
 */
export const MAP_FRAMES: Partial<Record<MunicipalityId, [number, number, number, number]>> = {
  odense: [10.1442, 55.27, 10.6085, 55.5001],
};
/** The map frame's margin around the region's bounding box, in km. */
export const MAP_FRAME_MARGIN_KM = 2;
