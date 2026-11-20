import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildReport, mergeChangeLog } from './report';

const { values } = parseArgs({
  options: {
    out: {
      type: 'string',
      default: fileURLToPath(new URL('../../../docs/BALANCE.md', import.meta.url)),
    },
    'pair-n': { type: 'string', default: '400' },
    'team-n': { type: 'string', default: '2000' },
    seed: { type: 'string', default: '1' },
  },
});

const started = performance.now();
const report = buildReport({
  pairN: Number(values['pair-n']),
  teamN: Number(values['team-n']),
  seed: Number(values.seed),
});
const previous = existsSync(values.out) ? readFileSync(values.out, 'utf8') : null;
writeFileSync(values.out, mergeChangeLog(previous, report.markdown));
const summary = report.markdown.split('## Flags')[0]!.split('## Summary')[1]!.trim();
console.log(summary);
console.log(`\nFlags:\n${report.flags.map((f) => `  - ${f}`).join('\n') || '  none'}`);
console.log(`\nWrote ${values.out} in ${((performance.now() - started) / 1000).toFixed(1)}s`);
