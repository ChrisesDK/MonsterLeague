import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocs } from './build';

const root = new URL('../../../', import.meta.url);
for (const f of buildDocs()) {
  const path = fileURLToPath(new URL(f.path, root));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, f.text);
  console.log(`wrote ${f.path}`);
}
