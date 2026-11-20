import typesJson from '../content/types.json';
import speciesJson from '../content/species.json';
import movesJson from '../content/moves.json';
import itemsJson from '../content/items.json';
import trainersJson from '../content/trainers.json';
import playerTeamsJson from '../content/player-teams.json';
import spawnsJson from '../content/spawns.json';
import fieldAbilitiesJson from '../content/field-abilities.json';
import poisJson from '../content/pois.odense.json';
import enJson from '../i18n/en.json';
import daJson from '../i18n/da.json';
import {
  I18nSchema,
  ItemsFileSchema,
  PlayerTeamsFileSchema,
  SpawnsFileSchema,
  FieldAbilitiesFileSchema,
  PoisFileSchema,
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
  type Species,
  type Trainer,
  type TypeId,
} from './schemas';

export * from './schemas';
export { checkContent, checkI18n, FALLBACK_MOVE_ID } from './check';

/** All game content, validated and indexed by id. */
export interface Dex {
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
export function parseContent(raw: RawContent): Dex {
  const types = TypesFileSchema.parse(raw.types);
  const typeColors = {} as Record<TypeId, string>;
  for (const t of types.types) typeColors[t.id] = t.color;
  return {
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
  };
}

export const rawContent: RawContent = {
  types: typesJson,
  species: speciesJson,
  moves: movesJson,
  items: itemsJson,
  trainers: trainersJson,
  playerTeams: playerTeamsJson,
  spawns: spawnsJson,
  fieldAbilities: fieldAbilitiesJson,
  pois: poisJson,
};

/** The default, validated game content. */
export const content: Dex = parseContent(rawContent);

export type Locale = 'en' | 'da';
export const i18n: Record<Locale, I18nTable> = {
  en: I18nSchema.parse(enJson),
  da: I18nSchema.parse(daJson),
};
