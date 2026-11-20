import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import { classify, TARGETS } from '../src/report';
import { parseSide, playerTeamSide, runSim, STARTERS } from '../src/sim';

/**
 * Balance regression guard: each arena's expected player team must stay inside the leader
 * targets (neutral 40–60%, advantage 75–90%, disadvantage 15–30%), with ±5 points of slack
 * for the smaller sample used here. Run `pnpm sim:report` for the full picture.
 */
const SLACK = 5;
const N = 600;

describe('leader balance targets', () => {
  for (const preset of Object.values(content.playerTeams)) {
    const leader = Object.values(content.trainers).find(
      (t) => t.tier === 'leader' && t.arena === preset.arena,
    )!;
    for (const starter of STARTERS) {
      const cls = classify(starter, leader.theme, content);
      const [lo, hi] = TARGETS[cls];
      it(`${preset.id}/${starter} vs ${leader.id} (${cls}) wins ${lo}–${hi}%`, () => {
        const r = runSim({
          a: playerTeamSide(preset.id, starter),
          b: parseSide(leader.id),
          n: N,
          seed: 4242,
        });
        expect(r.errors).toEqual([]);
        const win = (100 * r.sides[0].wins) / r.turns.length;
        expect(win).toBeGreaterThanOrEqual(lo - SLACK);
        expect(win).toBeLessThanOrEqual(hi + SLACK);
        expect(win).toBeGreaterThan(0);
      });
    }
  }
});
