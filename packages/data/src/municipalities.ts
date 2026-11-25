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
