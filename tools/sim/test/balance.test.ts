import { REGION_IDS, regions } from '@oml/data';
import { describe, expect, it } from 'vitest';
import { classify, TARGETS } from '../src/report';
import { parseSide, playerTeamSide, runSim, startersOf } from '../src/sim';

/**
 * Balance regression guard: each arena's expected player team must stay inside the leader
 * targets (neutral 40–60%, advantage 75–90%, disadvantage 15–30%), with ±5 points of slack
 * for the smaller sample used here. Run `pnpm sim:report` for the full picture.
 */
const SLACK = 5;
const N = 600;
/** P28 (open regions): every leader at every tier, a smaller sample per match-up. */
const N_OPEN = 300;
/** Open regions: the mean over the three starters, and the range for each starter. */
const OPEN_MEAN: [number, number] = [35, 65];
/** Open regions: no starter ever always loses or always wins (as the GDD's "never 0 %"). */
const OPEN_EACH: [number, number] = [0, 100];

const winRate = (r: ReturnType<typeof runSim>) => (100 * r.sides[0].wins) / r.turns.length;
const withPlayers = REGION_IDS.filter((r) => Object.keys(regions[r].playerTeams).length > 0);

describe.each(withPlayers.filter((r) => !regions[r].open))(
  'leader balance targets (%s)',
  (region) => {
    const dex = regions[region];
    for (const preset of Object.values(dex.playerTeams)) {
      const leader = Object.values(dex.trainers).find(
        (t) => t.tier === 'leader' && t.arena === preset.arena,
      )!;
      for (const starter of startersOf(dex)) {
        const cls = classify(starter, leader.theme, dex);
        const [lo, hi] = TARGETS[cls];
        it(`${preset.id}/${starter} vs ${leader.id} (${cls}) wins ${lo}–${hi}%`, () => {
          const r = runSim({
            a: playerTeamSide(preset.id, starter, dex),
            b: parseSide(leader.id, dex),
            n: N,
            seed: 4242,
            dex,
          });
          expect(r.errors).toEqual([]);
          const win = winRate(r);
          expect(win).toBeGreaterThanOrEqual(lo - SLACK);
          expect(win).toBeLessThanOrEqual(hi + SLACK);
          expect(win).toBeGreaterThan(0);
        });
      }
    }
  },
);

/**
 * P28: in an open region every leader is checked at every tier (badges held 0–7) against the
 * balanced team a player brings with that many badges (preset arena n = n − 1 badges): every
 * arena about as hard at a tier, and no starter ever sure to lose or win. (The starter alone
 * never fights an arena: arenas need ARENA_MIN_TEAM creatures, tested in packages/game.)
 */
describe.each(withPlayers.filter((r) => regions[r].open))('open region balance (%s)', (region) => {
  const dex = regions[region];
  const leaders = Object.values(dex.trainers).filter((t) => t.tier === 'leader');
  for (const preset of Object.values(dex.playerTeams))
    for (const leader of leaders) {
      const spec = `${leader.id}@${preset.arena - 1}`;
      it(`${preset.id} vs ${spec}: mean ${OPEN_MEAN.join('–')}%, each above 0% and below 100%`, () => {
        const wins = startersOf(dex).map((starter) => {
          const r = runSim({
            a: playerTeamSide(preset.id, starter, dex),
            b: parseSide(spec, dex),
            n: N_OPEN,
            seed: 4242,
            dex,
          });
          expect(r.errors).toEqual([]);
          return winRate(r);
        });
        const mean = wins.reduce((a, b) => a + b, 0) / wins.length;
        expect(mean).toBeGreaterThanOrEqual(OPEN_MEAN[0]);
        expect(mean).toBeLessThanOrEqual(OPEN_MEAN[1]);
        for (const w of wins) {
          expect(w).toBeGreaterThan(OPEN_EACH[0]);
          expect(w).toBeLessThan(OPEN_EACH[1]);
        }
      });
    }
});
