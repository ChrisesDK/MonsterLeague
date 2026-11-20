import { parseArgs } from 'node:util';
import { formatReport, parseSide, runSim } from './sim';

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'starter_fire:12' },
    b: { type: 'string', default: 'leader_water' },
    n: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    kind: { type: 'string' },
    'player-team': { type: 'string' },
    starter: { type: 'string', default: 'fire' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage: pnpm sim --a <side> --b <side> [--n 10000] [--seed 1] [--kind trainer|leader|wild]

<side> is a trainer id (leader_water), speciesId:level (gnistkat:12), a starter alias
(starter_fire, starter_water, starter_grove), several species joined with ",", or a player
team preset team:<preset>:<starter> (team:arena2:grove).

--player-team <preset> [--starter fire|water|grove] sets side A to that preset.`);
  process.exit(0);
}

const a = values['player-team']
  ? parseSide(`team:${values['player-team']}:${values.starter}`)
  : parseSide(values.a);
const b = parseSide(values.b);
const n = Number(values.n);
const seed = Number(values.seed);
if (!Number.isInteger(n) || n < 1) throw new Error('--n must be a positive integer');
const kind = values.kind as 'trainer' | 'leader' | 'wild' | undefined;

const report = runSim({ a, b, n, seed, ...(kind ? { kind } : {}) });
console.log(formatReport(report, a, b));
process.exit(report.errors.length > 0 ? 1 : 0);
