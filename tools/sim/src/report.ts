import { content, type Dex, type Trainer, type TypeId } from '@oml/data';
import {
  createBattle,
  createCreature,
  expectedMoveDamage,
  getMaxHp,
  getMove,
  typeEffectiveness,
} from '@oml/engine';
import {
  median,
  parseSide,
  playerTeamSide,
  runSim,
  STARTER_ALIASES,
  STARTERS,
  type SideSpec,
  type Starter,
} from './sim';

export const REPORT_LEVELS = [10, 25] as const;

export interface ReportOptions {
  /** Battles per 1v1 pair (split evenly over both side orders). */
  pairN: number;
  /** Battles per team match-up. */
  teamN: number;
  seed: number;
  dex?: Dex;
}

export type MatchClass = 'advantage' | 'neutral' | 'disadvantage';
export const TARGETS: Record<MatchClass, [number, number]> = {
  neutral: [40, 60],
  advantage: [75, 90],
  disadvantage: [15, 30],
};

interface PairResult {
  /** Win rate of the row species, 0–100. */
  win: number;
  medianTurns: number;
}

export interface TeamRow {
  preset: string;
  starter: Starter;
  trainer: string;
  tier: Trainer['tier'];
  cls: MatchClass;
  win: number;
  medianTurns: number;
  ok: boolean | null;
}

export interface ReportResult {
  markdown: string;
  matrices: Record<number, PairResult[][]>;
  teams: TeamRow[];
  neutralMedianTurns: Record<number, number>;
  hits: Record<number, { neutral: number; superEffective: number }>;
  flags: string[];
}

function pairIsNeutral(a: readonly TypeId[], b: readonly TypeId[], dex: Dex): boolean {
  return (
    a.every((t) => typeEffectiveness(t, b, dex) === 1) &&
    b.every((t) => typeEffectiveness(t, a, dex) === 1)
  );
}

/** Starter type vs leader theme: ratio of what each side's STAB deals to the other. */
export function classify(starter: Starter, theme: TypeId | undefined, dex: Dex): MatchClass {
  if (!theme) return 'neutral';
  const ratio = typeEffectiveness(starter, [theme], dex) / typeEffectiveness(theme, [starter], dex);
  return ratio > 1 ? 'advantage' : ratio < 1 ? 'disadvantage' : 'neutral';
}

/** Analytical hits-to-KO with the attacker's best STAB move of the given effectiveness. */
function hitsToKo(aId: string, bId: string, level: number, mul: number, dex: Dex): number | null {
  const a = createCreature(aId, level, 'a', dex);
  const b = createCreature(bId, level, 'b', dex);
  const state = createBattle({ kind: 'trainer', sides: [{ team: [a] }, { team: [b] }] }, 1, dex);
  const aTypes = dex.species[aId]!.types;
  const bTypes = dex.species[bId]!.types;
  let best = 0;
  for (const slot of a.moves) {
    const move = getMove(slot.moveId, dex);
    if (move.power === 0 || !aTypes.includes(move.type)) continue;
    if (typeEffectiveness(move.type, bTypes, dex) !== mul) continue;
    best = Math.max(best, expectedMoveDamage(state, 0, move.id, dex));
  }
  return best > 0 ? Math.ceil(getMaxHp(b, dex) / best) : null;
}

const fmtPct = (x: number) => `${Math.round(x)}%`;

export function buildReport(opts: ReportOptions): ReportResult {
  const dex = opts.dex ?? content;
  const ids = Object.keys(dex.species);
  const flags: string[] = [];
  const matrices: Record<number, PairResult[][]> = {};
  const neutralMedianTurns: Record<number, number> = {};
  const hits: Record<number, { neutral: number; superEffective: number }> = {};
  const lines: string[] = [];

  // ---- (a) 1v1 matrices -------------------------------------------------
  for (const level of REPORT_LEVELS) {
    const m: PairResult[][] = ids.map(() => ids.map(() => ({ win: NaN, medianTurns: NaN })));
    const neutralTurns: number[] = [];
    const neutralHits: number[] = [];
    const seHits: number[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = parseSide(`${ids[i]}:${level}`, dex);
        const b = parseSide(`${ids[j]}:${level}`, dex);
        const half = Math.max(1, Math.floor(opts.pairN / 2));
        const seed = opts.seed + (i * ids.length + j) * 100_003 + level;
        const r1 = runSim({ a, b, n: half, seed, kind: 'trainer', dex });
        const r2 = runSim({ a: b, b: a, n: half, seed: seed + 50_000, kind: 'trainer', dex });
        const errors = r1.errors.length + r2.errors.length;
        if (errors)
          flags.push(`ERROR: ${errors} battle(s) threw in ${ids[i]} vs ${ids[j]} L${level}`);
        const aWins = r1.sides[0].wins + r2.sides[1].wins;
        const total = r1.turns.length + r2.turns.length;
        const turns = median([...r1.turns, ...r2.turns]);
        const win = (100 * aWins) / total;
        m[i]![j] = { win, medianTurns: turns };
        m[j]![i] = { win: 100 - win, medianTurns: turns };
        if (pairIsNeutral(dex.species[ids[i]!]!.types, dex.species[ids[j]!]!.types, dex)) {
          neutralTurns.push(turns);
        }
        const pairs: [string, string][] = [
          [ids[i]!, ids[j]!],
          [ids[j]!, ids[i]!],
        ];
        for (const [x, y] of pairs) {
          const n = hitsToKo(x, y, level, 1, dex);
          if (n !== null) neutralHits.push(n);
          const s = hitsToKo(x, y, level, 2, dex);
          if (s !== null) seHits.push(s);
        }
      }
    }
    matrices[level] = m;
    neutralMedianTurns[level] = median(neutralTurns);
    hits[level] = { neutral: median(neutralHits), superEffective: median(seHits) };
  }

  // ---- (b) expected player team vs trainers ------------------------------
  const teams: TeamRow[] = [];
  const presets = Object.values(dex.playerTeams).sort((x, y) => x.arena - y.arena);
  for (const preset of presets) {
    const trainers = Object.values(dex.trainers).filter((t) => t.arena === preset.arena);
    for (const trainer of trainers) {
      for (const starter of STARTERS) {
        const a: SideSpec = playerTeamSide(preset.id, starter, dex);
        const b = parseSide(trainer.id, dex);
        const r = runSim({ a, b, n: opts.teamN, seed: opts.seed, dex });
        if (r.errors.length)
          flags.push(
            `ERROR: ${r.errors.length} battle(s) threw in ${preset.id}/${starter} vs ${trainer.id}`,
          );
        const win = (100 * r.sides[0].wins) / r.turns.length;
        const cls = classify(starter, trainer.theme, dex);
        const [lo, hi] = TARGETS[cls];
        const ok = trainer.tier === 'leader' ? win >= lo && win <= hi : null;
        teams.push({
          preset: preset.id,
          starter,
          trainer: trainer.id,
          tier: trainer.tier,
          cls,
          win,
          medianTurns: median(r.turns),
          ok,
        });
      }
    }
  }

  // ---- (c) flags ----------------------------------------------------------
  const shortFights: string[] = [];
  const extremes: string[] = [];
  for (const level of REPORT_LEVELS) {
    const m = matrices[level]!;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const c = m[i]![j]!;
        if (c.medianTurns < 4)
          shortFights.push(`L${level} ${ids[i]} vs ${ids[j]}: median ${c.medianTurns}`);
        if (c.win === 0 || c.win === 100)
          extremes.push(`L${level} ${ids[i]} vs ${ids[j]}: ${fmtPct(c.win)}`);
      }
    }
    for (let i = 0; i < ids.length; i++) {
      const rates = m[i]!.filter((_, j) => j !== i).map((c) => c.win);
      const avg = rates.reduce((x, y) => x + y, 0) / rates.length;
      if (avg > 70) flags.push(`L${level} ${ids[i]} wins ${fmtPct(avg)} of its 1v1s (> 70%)`);
    }
  }
  for (const t of teams) {
    if (t.win === 0 || t.win === 100)
      extremes.push(`${t.preset}/${t.starter} vs ${t.trainer}: ${fmtPct(t.win)}`);
  }
  if (shortFights.length)
    flags.push(`${shortFights.length} 1v1 pair(s) with a median below 4 turns`);
  if (extremes.length) flags.push(`${extremes.length} match-up(s) at 0% or 100%`);

  // ---- markdown -----------------------------------------------------------
  const short = (id: string) => id.slice(0, 6);
  lines.push(
    '# Balance report',
    '',
    `Generated by \`pnpm sim:report\` (deterministic: seed ${opts.seed}, ${opts.pairN} battles per 1v1 pair split over both side orders, ${opts.teamN} per team match-up). Both 1v1 sides use the trainer AI; player-team presets use the leader AI as a stand-in for a competent human. Do not edit by hand.`,
    '',
    '## Summary',
    '',
    '| Metric | L10 | L25 | Target |',
    '| --- | --- | --- | --- |',
    `| Median turns, neutral 1v1 (median of pair medians) | ${neutralMedianTurns[10]} | ${neutralMedianTurns[25]} | 4–6 |`,
    `| Hits to KO, best neutral STAB move (median) | ${hits[10]!.neutral} | ${hits[25]!.neutral} | 4–6 |`,
    `| Hits to KO, super-effective STAB move (median) | ${hits[10]!.superEffective} | ${hits[25]!.superEffective} | 2–3 |`,
    '',
    '| Player team | vs | Class | Win | Median turns | Target |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const t of teams) {
    const target =
      t.tier === 'leader'
        ? `${TARGETS[t.cls][0]}–${TARGETS[t.cls][1]}% ${t.ok ? '✅' : '❌'}`
        : '— (not a leader)';
    lines.push(
      `| ${t.preset} / ${t.starter} (${STARTER_ALIASES[`starter_${t.starter}`]}) | ${t.trainer} | ${t.cls} | ${fmtPct(t.win)} | ${t.medianTurns} | ${target} |`,
    );
  }
  lines.push('', '## Flags', '');
  if (flags.length === 0) lines.push('None.');
  for (const f of flags) lines.push(`- ${f}`);
  if (extremes.length) {
    lines.push('', '<details><summary>Match-ups at 0% or 100%</summary>', '');
    for (const e of extremes) lines.push(`- ${e}`);
    lines.push('', '</details>');
  }
  if (shortFights.length) {
    lines.push('', '<details><summary>1v1 pairs with median below 4 turns</summary>', '');
    for (const e of shortFights) lines.push(`- ${e}`);
    lines.push('', '</details>');
  }

  for (const level of REPORT_LEVELS) {
    const m = matrices[level]!;
    lines.push(
      '',
      `## 1v1 matrix, level ${level}`,
      '',
      'Cell = row species win rate / median turns. Last column = row species average win rate.',
      '',
      `| | ${ids.map(short).join(' | ')} | avg |`,
      `| --- | ${ids.map(() => '---').join(' | ')} | --- |`,
    );
    ids.forEach((id, i) => {
      const cells = ids.map((_, j) =>
        i === j ? '—' : `${Math.round(m[i]![j]!.win)}/${m[i]![j]!.medianTurns}`,
      );
      const rates = m[i]!.filter((_, j) => j !== i).map((c) => c.win);
      const avg = rates.reduce((x, y) => x + y, 0) / rates.length;
      lines.push(`| **${short(id)}** | ${cells.join(' | ')} | ${fmtPct(avg)} |`);
    });
  }
  lines.push('');
  return { markdown: lines.join('\n'), matrices, teams, neutralMedianTurns, hits, flags };
}
