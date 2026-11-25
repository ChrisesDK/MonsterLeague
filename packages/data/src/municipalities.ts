/** Municipalities on Fyn (content/shared/fyn.geojson). Names are i18n keys `municipality.<id>.name`. */
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
/**
 * P27: every id in a region's content (zones, routes, POIs, trainers, species…) starts with
 * the region's prefix, so no two regions can ever share an id. Odense, the first region,
 * keeps its unprefixed ids. Checked by test/regions.test.ts.
 */
export const REGION_ID_PREFIX: Partial<Record<MunicipalityId, string>> = {
  odense: '',
  svendborg: 'svb_',
};

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
  svendborg: [10.3292, 54.925, 10.8439, 55.2397],
};
/** The map frame's margin around the region's bounding box, in km. */
export const MAP_FRAME_MARGIN_KM = 2;
