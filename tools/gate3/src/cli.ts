import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { summarizeGate3 } from '@oml/playtest';
import { formatGate3, loadGate3Files } from './report';

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: pnpm gate3:report <folder with exported .json/.csv files>');
  process.exit(2);
}
const dir = resolve(process.env.INIT_CWD ?? process.cwd(), folder);
if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Not a folder: ${dir}`);
  process.exit(2);
}
const names = readdirSync(dir).filter((n) => /\.(json|csv)$/i.test(n));
const { sessions, errors } = loadGate3Files(
  names.map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') })),
);
for (const e of errors) console.error(`skipped ${e}`);
console.log(formatGate3(summarizeGate3(sessions), names.length - errors.length));
