/**
 * P28 (open regions): leaders and trainers scale with the number of badges the player holds,
 * so no part of the region is a wall or a pushover wherever a player starts. Regions that are
 * not open (`dex.open` false) keep their fixed teams.
 */
import { content, type Dex, type Trainer } from '@oml/data';
import { autoMoveset } from '@oml/engine';

/** The highest tier: the last arena anyone wins is met with 7 badges. */
export const MAX_TIER = 7;
const LEVEL_CAP = 50;
const MIN_LEVEL = 2;

/** A challenge's tier: the number of badges the player holds (0–7). */
export function challengeTier(badges: readonly number[]): number {
  return Math.min(MAX_TIER, badges.length);
}

const clampLevel = (l: number) => Math.min(LEVEL_CAP, Math.max(MIN_LEVEL, Math.round(l)));

/** The first stage of a species' line (walks back through the evolutions). */
export function baseForm(speciesId: string, dex: Dex = content): string {
  let id = speciesId;
  for (let guard = 0; guard < 5; guard++) {
    const prev = Object.values(dex.species).find((s) => s.evolution?.into === id);
    if (!prev) break;
    id = prev.id;
  }
  return id;
}

/** The stage of `speciesId`'s line a creature of `level` has reached (evolving by level). */
export function formAtLevel(speciesId: string, level: number, dex: Dex = content): string {
  let id = baseForm(speciesId, dex);
  for (let evo = dex.species[id]?.evolution; evo && level >= evo.level;) {
    id = evo.into;
    evo = dex.species[id]?.evolution;
  }
  return id;
}

/** The district a trainer stands in (its POI's), or null when it stands nowhere. */
export function trainerHome(trainerId: string, dex: Dex = content): number | null {
  for (const p of Object.values(dex.pois)) {
    if (p.kind === 'trainer' && p.trainer === trainerId) return p.district;
    if (p.kind === 'arena' && p.trainers.includes(trainerId)) return p.district;
  }
  return null;
}

export interface TeamMember {
  speciesId: string;
  level: number;
  moves?: string[];
  coverage?: string;
}

/** The moves a member knows: its explicit ones, or those learned by its level plus coverage. */
function withCoverage(m: TeamMember, dex: Dex): TeamMember {
  if (m.moves || !m.coverage) return m;
  const learned = (dex.species[m.speciesId]?.learnset ?? [])
    .filter((e) => e.level <= m.level)
    .map((e) => e.moveId);
  return { ...m, moves: autoMoveset([...learned, m.coverage], dex) };
}

export interface ScaledTeam {
  team: TeamMember[];
  items: Record<string, number>;
  /** The tier it was built for (null: a fixed team, not an open region). */
  tier: number | null;
}

/**
 * The team a trainer brings against a player holding `badges` (P28).
 *
 * - Leaders with `tiers`: the first `size` members of the roster, the strongest at the tier's
 *   level and the others as far below it as in the roster; sent out weakest first.
 * - Other trainers (juniors, route trainers): their team moved by the difference between
 *   the player's level band (badges + 1) and the band of the district they stand in.
 *
 * Every member takes the form its line has reached at its level (a tier-0 leader shows first
 * stages). Explicit moves are kept.
 */
export function scaledTeam(
  trainer: Trainer,
  badges: readonly number[],
  dex: Dex = content,
): ScaledTeam {
  if (!dex.open) return { team: trainer.team, items: { ...trainer.items }, tier: null };
  const tier = challengeTier(badges);
  const form = (m: TeamMember): TeamMember => ({
    ...m,
    speciesId: formAtLevel(m.speciesId, m.level, dex),
  });
  if (trainer.tiers) {
    const at = trainer.tiers[tier]!;
    const top = Math.max(...trainer.team.map((m) => m.level));
    const members = trainer.team
      .slice(0, at.size)
      .map((m) => ({ ...m, level: clampLevel(at.level - (top - m.level)) }));
    const ordered = members
      .map((m, i) => ({ m, i }))
      .sort((a, b) => a.m.level - b.m.level || a.i - b.i)
      .map(({ m }) => withCoverage(form(m), dex));
    return { team: ordered, items: { ...(at.items ?? trainer.items) }, tier };
  }
  const home = trainerHome(trainer.id, dex);
  const band = dex.districtBands[Math.min(8, tier + 1)];
  const homeBand = home === null ? undefined : dex.districtBands[home];
  if (!band || !homeBand) return { team: trainer.team, items: { ...trainer.items }, tier };
  const shift = band[0] - homeBand[0];
  return {
    team: trainer.team.map((m) => form({ ...m, level: clampLevel(m.level + shift) })),
    items: { ...trainer.items },
    tier,
  };
}

/**
 * P28: the teammates of a balance preset (player-teams.json) for a starter. An open region's
 * preset lists a wild Fire, Water and Grove creature plus Folk ones; the one sharing the
 * starter's type is left out. Other regions' presets are used as they are.
 */
export function presetMates(
  preset: { team: readonly TeamMember[] },
  starterId: string,
  dex: Dex = content,
): TeamMember[] {
  if (!dex.open) return [...preset.team];
  const own = dex.species[baseForm(starterId, dex)]?.types[0];
  const skip = preset.team.findIndex((m) => dex.species[m.speciesId]?.types[0] === own);
  return preset.team.filter((_, i) => i !== skip);
}

/** The badges a player holds on the old path when meeting arena `n` (1 … n − 1). */
export const pathBadges = (arena: number): number[] =>
  Array.from({ length: Math.max(0, arena - 1) }, (_, i) => i + 1);
