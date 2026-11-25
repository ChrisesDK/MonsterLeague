import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDocs, loadRegion, spawnStats } from '../src/build';

describe('content docs (D169)', () => {
  const files = buildDocs();

  it("every region's CREATURES.md, TEAMS.md and spawn maps are up to date (run pnpm docs:content)", () => {
    for (const f of files) {
      const onDisk = readFileSync(new URL(`../../../${f.path}`, import.meta.url), 'utf8');
      expect(onDisk.replace(/\r\n/g, '\n'), `${f.path} is stale: run pnpm docs:content`).toBe(
        f.text,
      );
    }
  });

  it('lists every creature and every trainer', async () => {
    const { content } = await import('@oml/data');
    const creatures = files.find((f) => f.path === 'docs/regions/odense/CREATURES.md')!.text;
    const teams = files.find((f) => f.path === 'docs/regions/odense/TEAMS.md')!.text;
    for (const id of Object.keys(content.species)) expect(creatures).toContain(`\`${id}\``);
    for (const id of Object.keys(content.trainers)) expect(teams).toContain(`\`${id}\``);
  });

  it('D171: each destination creature spawns only at home, most at its main home', async () => {
    const { content } = await import('@oml/data');
    const stats = spawnStats(loadRegion());
    const homes = new Map<string, Map<string, number>>();
    for (const e of content.spawns)
      if (e.zones && !e.requires)
        for (const z of e.zones) {
          if (!homes.has(e.species)) homes.set(e.species, new Map());
          homes.get(e.species)!.set(z, (homes.get(e.species)!.get(z) ?? 0) + e.weight);
        }
    expect(homes.size).toBeGreaterThanOrEqual(5);
    for (const [species, byWeight] of homes) {
      const spawned = stats.byZone.get(species)!;
      // nowhere but its homes, and never outside destinations
      for (const z of spawned.keys()) expect(byWeight.has(z), `${species} in ${z}`).toBe(true);
      expect(stats.other.get(species) ?? 0).toBe(0);
      const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      expect(top(spawned), species).toBe(top(byWeight));
    }
  });
});
