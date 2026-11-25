// Shared by every region (P27): the type chart, moves, items and field abilities.
import typesJson from '../content/shared/types.json';
import movesJson from '../content/shared/moves.json';
import itemsJson from '../content/shared/items.json';
import fieldAbilitiesJson from '../content/shared/field-abilities.json';
import sharedEnJson from '../i18n/shared/en.json';
import sharedDaJson from '../i18n/shared/da.json';
// One folder per region (content/<region>/, i18n/<region>/, region/<region>/): nothing in
// one region's folder may refer to another's (checked by test/regions.test.ts).
import odenseSpeciesJson from '../content/odense/species.json';
import odenseTrainersJson from '../content/odense/trainers.json';
import odensePlayerTeamsJson from '../content/odense/player-teams.json';
import odenseSpawnsJson from '../content/odense/spawns.json';
import odensePoisJson from '../content/odense/pois.json';
import odenseArenasJson from '../content/odense/arenas.json';
import odenseRoutesJson from '../content/odense/routes.json';
import odenseZonesJson from '../content/odense/zones.json';
import odenseGoalsJson from '../content/odense/goals.json';
import odenseEnJson from '../i18n/odense/en.json';
import odenseDaJson from '../i18n/odense/da.json';
import svendborgSpeciesJson from '../content/svendborg/species.json';
import svendborgTrainersJson from '../content/svendborg/trainers.json';
import svendborgPlayerTeamsJson from '../content/svendborg/player-teams.json';
import svendborgSpawnsJson from '../content/svendborg/spawns.json';
import svendborgPoisJson from '../content/svendborg/pois.json';
import svendborgArenasJson from '../content/svendborg/arenas.json';
import svendborgRoutesJson from '../content/svendborg/routes.json';
import svendborgZonesJson from '../content/svendborg/zones.json';
import svendborgGoalsJson from '../content/svendborg/goals.json';
import svendborgEnJson from '../i18n/svendborg/en.json';
import svendborgDaJson from '../i18n/svendborg/da.json';
import {
  I18nSchema,
  ItemsFileSchema,
  PlayerTeamsFileSchema,
  SpawnsFileSchema,
  FieldAbilitiesFileSchema,
  PoisFileSchema,
  ArenasFileSchema,
  RoutesFileSchema,
  ZonesFileSchema,
  GoalsFileSchema,
  MovesFileSchema,
  SpeciesFileSchema,
  TrainersFileSchema,
  TypesFileSchema,
  type I18nTable,
  type Item,
  type Move,
  type PlayerTeam,
  type Spawn,
  type FieldAbility,
  type Poi,
  type ArenaSite,
  type Route,
  type Zone,
  type SideGoal,
  type Species,
  type Trainer,
  type TypeId,
} from './schemas';

export * from './schemas';
export {
  checkContent,
  checkI18n,
  checkSeparation,
  FALLBACK_MOVE_ID,
  REGION_TEXT_PREFIXES,
} from './check';
import { checkSeparation } from './check';

export * from './municipalities';

/** All game content, validated and indexed by id. */
/** Regions with content in this package (P27). Each is its own campaign. */
export const REGION_IDS = ['odense', 'svendborg'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export interface Dex {
  /** The region this content belongs to (P27). */
  region: RegionId;
  typeIds: TypeId[];
  typeColors: Record<TypeId, string>;
  /** chart[attacker][defender] = multiplier */
  chart: Record<TypeId, Record<TypeId, number>>;
  species: Record<string, Species>;
  moves: Record<string, Move>;
  items: Record<string, Item>;
  trainers: Record<string, Trainer>;
  /** Balance-tooling presets (expected player team per arena). */
  playerTeams: Record<string, PlayerTeam>;
  /** Spawn tables (empty until M2). */
  spawns: Spawn[];
  fieldAbilities: Record<string, FieldAbility>;
  /** Points of interest in Odense (arenas, trainers, rest stops). */
  pois: Record<string, Poi>;
  /** Arena sites 1–8 in arena order (M2d: routes, Town Map, Journal). */
  arenaSites: ArenaSite[];
  /** Numbered routes between zones (P22). */
  routes: Record<string, Route>;
  /** Zones of the region, by id (P22). */
  zones: Record<string, Zone>;
  /** Level band [min, max] per district 1–8. */
  districtBands: Record<number, [number, number]>;
  /** Journal side goals per district. */
  sideGoals: SideGoal[];
}

export interface RawContent {
  types: unknown;
  species: unknown;
  moves: unknown;
  items: unknown;
  trainers: unknown;
  playerTeams: unknown;
  spawns: unknown;
  fieldAbilities: unknown;
  pois: unknown;
  arenas: unknown;
  routes: unknown;
  zones: unknown;
  goals: unknown;
}

function indexById<T extends { id: string }>(list: T[], what: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const entry of list) {
    if (out[entry.id]) throw new Error(`Duplicate ${what} id "${entry.id}"`);
    out[entry.id] = entry;
  }
  return out;
}

/** Parses raw JSON content with the Zod schemas. Throws a ZodError on invalid data. */
export function parseContent(raw: RawContent, region: RegionId = 'odense'): Dex {
  const types = TypesFileSchema.parse(raw.types);
  const typeColors = {} as Record<TypeId, string>;
  for (const t of types.types) typeColors[t.id] = t.color;
  return {
    region,
    typeIds: types.types.map((t) => t.id),
    typeColors,
    chart: types.chart as Record<TypeId, Record<TypeId, number>>,
    species: indexById(SpeciesFileSchema.parse(raw.species).species, 'species'),
    moves: indexById(MovesFileSchema.parse(raw.moves).moves, 'move'),
    items: indexById(ItemsFileSchema.parse(raw.items).items, 'item'),
    trainers: indexById(TrainersFileSchema.parse(raw.trainers).trainers, 'trainer'),
    playerTeams: indexById(PlayerTeamsFileSchema.parse(raw.playerTeams).playerTeams, 'player team'),
    spawns: SpawnsFileSchema.parse(raw.spawns).spawns,
    fieldAbilities: indexById(
      FieldAbilitiesFileSchema.parse(raw.fieldAbilities).fieldAbilities,
      'field ability',
    ),
    pois: indexById(PoisFileSchema.parse(raw.pois).pois, 'poi'),
    arenaSites: [...ArenasFileSchema.parse(raw.arenas).arenas].sort((a, b) => a.arena - b.arena),
    routes: indexById(RoutesFileSchema.parse(raw.routes).routes, 'route'),
    ...(() => {
      const z = ZonesFileSchema.parse(raw.zones);
      return {
        zones: indexById(z.zones, 'zone'),
        districtBands: Object.fromEntries(z.districts.map((d) => [d.id, d.wildLevels])),
      };
    })(),
    sideGoals: GoalsFileSchema.parse(raw.goals).sideGoals,
  };
}

const shared = {
  types: typesJson,
  moves: movesJson,
  items: itemsJson,
  fieldAbilities: fieldAbilitiesJson,
};

/** Raw content per region: the shared files plus the region's own folder. */
export const rawContentByRegion: Record<RegionId, RawContent> = {
  odense: {
    ...shared,
    species: odenseSpeciesJson,
    trainers: odenseTrainersJson,
    playerTeams: odensePlayerTeamsJson,
    spawns: odenseSpawnsJson,
    pois: odensePoisJson,
    arenas: odenseArenasJson,
    routes: odenseRoutesJson,
    zones: odenseZonesJson,
    goals: odenseGoalsJson,
  },
  svendborg: {
    ...shared,
    species: svendborgSpeciesJson,
    trainers: svendborgTrainersJson,
    playerTeams: svendborgPlayerTeamsJson,
    spawns: svendborgSpawnsJson,
    pois: svendborgPoisJson,
    arenas: svendborgArenasJson,
    routes: svendborgRoutesJson,
    zones: svendborgZonesJson,
    goals: svendborgGoalsJson,
  },
};

/** Validated content per region. */
export const regions: Record<RegionId, Dex> = Object.fromEntries(
  REGION_IDS.map((r) => [r, parseContent(rawContentByRegion[r], r)]),
) as Record<RegionId, Dex>;

/**
 * The default content: Odense, the region the app plays until campaigns per region exist
 * (P27). Code that serves more than one region takes a region's Dex instead.
 */
export const content: Dex = regions.odense;
export const rawContent: RawContent = rawContentByRegion.odense;

export type Locale = 'en' | 'da';
/** UI texts shared by every region. */
export const sharedI18n: Record<Locale, I18nTable> = {
  en: I18nSchema.parse(sharedEnJson),
  da: I18nSchema.parse(sharedDaJson),
};
/** Each region's own texts (species, trainers, places, zones, routes, badges…). */
export const regionI18n: Record<RegionId, Record<Locale, I18nTable>> = {
  odense: { en: I18nSchema.parse(odenseEnJson), da: I18nSchema.parse(odenseDaJson) },
  svendborg: { en: I18nSchema.parse(svendborgEnJson), da: I18nSchema.parse(svendborgDaJson) },
};

/** P27: the regions never overlap or mix (prefixes, unique ids, texts in their own files). */
export function checkRegionSeparation(): string[] {
  return checkSeparation(regions, sharedI18n, regionI18n);
}
/** The texts for one region: shared UI plus the region's own. */
export function i18nFor(region: RegionId): Record<Locale, I18nTable> {
  return {
    en: { ...sharedI18n.en, ...regionI18n[region].en },
    da: { ...sharedI18n.da, ...regionI18n[region].da },
  };
}
/** The default texts (Odense, like `content`). */
export const i18n: Record<Locale, I18nTable> = i18nFor('odense');
