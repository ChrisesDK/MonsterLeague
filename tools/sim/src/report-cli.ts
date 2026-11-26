import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { REGION_IDS, regions, type RegionId } from '@oml/data';
import { buildReport, mergeChangeLog } from './report';

const { values } = parseArgs({
  options: {
    // Odense's report is docs/BALANCE.md; other regions' docs/regions/<region>/BALANCE.md
    out: { type: 'string' },
    region: { type: 'string', default: 'odense' },
    'pair-n': { type: 'string', default: '400' },
    'team-n': { type: 'string', default: '2000' },
    seed: { type: 'string', default: '1' },
  },
});

if (!(REGION_IDS as readonly string[]).includes(values.region))
  throw new Error(`--region must be one of ${REGION_IDS.join(', ')}`);
const region = values.region as RegionId;
const out =
  values.out ??
  fileURLToPath(
    new URL(
      region === 'odense'
        ? '../../../docs/BALANCE.md'
        : `../../../docs/regions/${region}/BALANCE.md`,
      import.meta.url,
    ),
  );
const started = performance.now();
const report = buildReport({
  dex: regions[region],
  pairN: Number(values['pair-n']),
  teamN: Number(values['team-n']),
  seed: Number(values.seed),
});
const previous = existsSync(out) ? readFileSync(out, 'utf8') : null;
writeFileSync(out, mergeChangeLog(previous, report.markdown));
const summary = report.markdown.split('## Flags')[0]!.split('## Summary')[1]!.trim();
console.log(summary);
console.log(`\nFlags:\n${report.flags.map((f) => `  - ${f}`).join('\n') || '  none'}`);
console.log(`\nWrote ${out} in ${((performance.now() - started) / 1000).toFixed(1)}s`);
