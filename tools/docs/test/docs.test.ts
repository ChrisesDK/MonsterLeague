import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDocs } from '../src/build';

describe('content docs (D169)', () => {
  const files = buildDocs();

  it('docs/CREATURES.md, docs/TEAMS.md and the spawn maps are up to date (run pnpm docs:content)', () => {
    for (const f of files) {
      const onDisk = readFileSync(new URL(`../../../${f.path}`, import.meta.url), 'utf8');
      expect(onDisk.replace(/\r\n/g, '\n'), `${f.path} is stale: run pnpm docs:content`).toBe(
        f.text,
      );
    }
  });

  it('lists every creature and every trainer', async () => {
    const { content } = await import('@oml/data');
    const creatures = files.find((f) => f.path === 'docs/CREATURES.md')!.text;
    const teams = files.find((f) => f.path === 'docs/TEAMS.md')!.text;
    for (const id of Object.keys(content.species)) expect(creatures).toContain(`\`${id}\``);
    for (const id of Object.keys(content.trainers)) expect(teams).toContain(`\`${id}\``);
  });
});
