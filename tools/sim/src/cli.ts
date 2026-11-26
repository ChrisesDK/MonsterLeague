import { parseArgs } from 'node:util';
import { REGION_IDS, regions, type RegionId } from '@oml/data';
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
    region: { type: 'string', default: 'odense' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage: pnpm sim --a <side> --b <side> [--n 10000] [--seed 1] [--kind trainer|leader|wild]

<side> is a trainer id (leader_water), speciesId:level (gnistkat:12), a starter alias
(starter_fire, starter_water, starter_grove), several species joined with ",", or a player
team preset team:<preset>:<starter> (team:arena2:grove).

--player-team <preset> [--starter fire|water|grove] sets side A to that preset.
--region <id> plays with that region's creatures and trainers (default odense; Svendborg's
starters are water, stone and storm).`);
  process.exit(0);
}

if (!(REGION_IDS as readonly string[]).includes(values.region))
  throw new Error(`--region must be one of ${REGION_IDS.join(', ')}`);
const dex = regions[values.region as RegionId];
const a = values['player-team']
  ? parseSide(`team:${values['player-team']}:${values.starter}`, dex)
  : parseSide(values.a, dex);
const b = parseSide(values.b, dex);
const n = Number(values.n);
const seed = Number(values.seed);
if (!Number.isInteger(n) || n < 1) throw new Error('--n must be a positive integer');
const kind = values.kind as 'trainer' | 'leader' | 'wild' | undefined;

const report = runSim({ a, b, n, seed, dex, ...(kind ? { kind } : {}) });
console.log(formatReport(report, a, b));
process.exit(report.errors.length > 0 ? 1 : 0);
