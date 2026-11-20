import { content, type Dex } from '@oml/data';
import {
  chooseAiAction,
  createBattle,
  createCreature,
  getActive,
  resolveTurn,
  MAX_TURNS,
  type Action,
  type AiTier,
  type BattleKind,
  type CreatureInstance,
  type SideConfig,
} from '@oml/engine';

export const STARTER_ALIASES: Record<string, string> = {
  starter_fire: 'gnistkat',
  starter_water: 'aaodder',
  starter_grove: 'boegling',
};

export interface SideSpec {
  label: string;
  tier: AiTier;
  /** Builds a fresh team (uids prefixed so both sides stay unique). */
  build: (prefix: string) => SideConfig;
}

/**
 * Parses a side spec: a trainer id (`leader_water`), `speciesId:level`, a starter alias
 * (`starter_fire:12`), or several species specs joined with `,`.
 */
export function parseSide(spec: string, dex: Dex = content, defaultLevel = 10): SideSpec {
  const trainer = dex.trainers[spec];
  if (trainer) {
    return {
      label: `${trainer.id} [${trainer.team.map((m) => `${m.speciesId} L${m.level}`).join(', ')}]`,
      tier: trainer.tier,
      build: (prefix) => ({
        name: trainer.id,
        team: trainer.team.map((m, i) =>
          createCreature(
            m.speciesId,
            m.level,
            `${prefix}${i}`,
            dex,
            m.moves ? { moves: m.moves } : {},
          ),
        ),
        items: { ...trainer.items },
      }),
    };
  }
  const members = spec.split(',').map((part) => {
    const [rawId = '', rawLevel] = part.trim().split(':');
    const speciesId = STARTER_ALIASES[rawId] ?? rawId;
    if (!dex.species[speciesId]) throw new Error(`Unknown trainer or species "${rawId}"`);
    const level = rawLevel === undefined ? defaultLevel : Number(rawLevel);
    if (!Number.isInteger(level) || level < 1 || level > 100)
      throw new Error(`Bad level in "${part}"`);
    return { speciesId, level };
  });
  return {
    label: members.map((m) => `${m.speciesId} L${m.level}`).join(', '),
    tier: 'trainer',
    build: (prefix) => ({
      team: members.map((m, i) => createCreature(m.speciesId, m.level, `${prefix}${i}`, dex)),
    }),
  };
}

export interface SimOptions {
  a: SideSpec;
  b: SideSpec;
  n: number;
  seed: number;
  kind?: BattleKind;
  dex?: Dex;
}

export interface SideReport {
  wins: number;
  moves: Map<string, number>;
}

export interface SimReport {
  battles: number;
  kind: BattleKind;
  sides: [SideReport, SideReport];
  turns: number[];
  turnCapHits: number;
  errors: { seed: number; message: string }[];
  ms: number;
}

export function battleKindFor(a: SideSpec, b: SideSpec): BattleKind {
  return a.tier === 'leader' || b.tier === 'leader' ? 'leader' : 'trainer';
}

export function runSim(opts: SimOptions): SimReport {
  const dex = opts.dex ?? content;
  const kind = opts.kind ?? battleKindFor(opts.a, opts.b);
  const report: SimReport = {
    battles: opts.n,
    kind,
    sides: [
      { wins: 0, moves: new Map() },
      { wins: 0, moves: new Map() },
    ],
    turns: [],
    turnCapHits: 0,
    errors: [],
    ms: 0,
  };
  const started = performance.now();
  for (let i = 0; i < opts.n; i++) {
    const seed = opts.seed + i;
    try {
      const sideA = { ...opts.a.build('a'), ai: opts.a.tier };
      const sideB = { ...opts.b.build('b'), ai: opts.b.tier, gainsXp: false };
      let state = createBattle({ kind, sides: [sideA, sideB] }, seed, dex);
      while (state.result === 'ongoing') {
        const actions: [Action, Action] = [
          chooseAiAction(state, 0, opts.a.tier, dex),
          chooseAiAction(state, 1, opts.b.tier, dex),
        ];
        const result = resolveTurn(state, actions, dex);
        for (const e of result.events) {
          if (e.type === 'move_used') {
            const m = report.sides[e.side].moves;
            m.set(e.moveId, (m.get(e.moveId) ?? 0) + 1);
          }
        }
        state = result.state;
      }
      if (state.result === 'p1') report.sides[0].wins++;
      if (state.result === 'p2') report.sides[1].wins++;
      if (state.turn >= MAX_TURNS) report.turnCapHits++;
      report.turns.push(state.turn);
    } catch (err) {
      report.errors.push({ seed, message: err instanceof Error ? err.message : String(err) });
    }
  }
  report.ms = performance.now() - started;
  return report;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const pct = (x: number, n: number) => (n === 0 ? '0.0' : ((100 * x) / n).toFixed(1));

export function formatReport(r: SimReport, a: SideSpec, b: SideSpec, top = 5): string {
  const n = r.turns.length;
  const mean = n ? r.turns.reduce((x, y) => x + y, 0) / n : 0;
  const lines = [
    'Odense Monster League — battle sim',
    `A: ${a.label} (${a.tier} AI)`,
    `B: ${b.label} (${b.tier} AI)`,
    `Battle kind: ${r.kind}   battles: ${r.battles}   completed: ${n}   time: ${(r.ms / 1000).toFixed(2)}s`,
    '',
    `Win rate  A: ${pct(r.sides[0].wins, n)}%   B: ${pct(r.sides[1].wins, n)}%`,
    `Turns     mean ${mean.toFixed(2)}   median ${median(r.turns)}   min ${n ? Math.min(...r.turns) : 0}   max ${n ? Math.max(...r.turns) : 0}   turn cap hit: ${r.turnCapHits}`,
  ];
  for (const [i, label] of [
    [0, 'A'],
    [1, 'B'],
  ] as const) {
    const moves = [...r.sides[i].moves.entries()].sort((x, y) => y[1] - x[1]);
    const total = moves.reduce((s, [, c]) => s + c, 0);
    lines.push('', `Most used moves (${label}):`);
    for (const [id, count] of moves.slice(0, top)) {
      lines.push(
        `  ${id.padEnd(18)} ${String(count).padStart(8)}  ${pct(count, total).padStart(5)}%`,
      );
    }
  }
  lines.push('', `Errors: ${r.errors.length}`);
  for (const e of r.errors.slice(0, 5)) lines.push(`  seed ${e.seed}: ${e.message}`);
  return lines.join('\n');
}

export { getActive, type CreatureInstance };
