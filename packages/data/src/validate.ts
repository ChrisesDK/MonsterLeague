import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { RegionFileSchema } from './schemas';
import { checkContent, checkI18n, i18n, parseContent, rawContent, type Dex } from './index';

function main(): number {
  let dex: Dex;
  try {
    dex = parseContent(rawContent);
  } catch (err) {
    if (err instanceof ZodError) {
      for (const issue of err.issues)
        console.error(`schema: ${issue.path.join('.')}: ${issue.message}`);
    } else {
      console.error(err);
    }
    return 1;
  }
  const errors = [...checkContent(dex), ...checkI18n(dex, i18n), ...checkRegion()];
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} content error(s).`);
    return 1;
  }
  console.log(
    `✓ content valid: ${dex.typeIds.length} types, ${Object.keys(dex.species).length} species, ` +
      `${Object.keys(dex.moves).length} moves, ${Object.keys(dex.items).length} items, ` +
      `${Object.keys(dex.trainers).length} trainers, ${Object.keys(dex.fieldAbilities).length} field abilities, ` +
      `${Object.keys(i18n.en).length} i18n keys × 2 locales, region odense ok`,
  );
  return 0;
}

/** Region files (built by tools/region-builder) and the district polygons they came from. */
function checkRegion(): string[] {
  const errors: string[] = [];
  const read = (rel: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
  const parsed = RegionFileSchema.safeParse(read('../region/region.odense.json'));
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 5))
      errors.push(`region.odense.json: ${i.path.join('.')}: ${i.message}`);
    return errors;
  }
  const region = parsed.data;
  const geo = read('../content/districts.odense.geojson') as {
    features: { properties: { id: number; wildLevels: [number, number]; draft: boolean } }[];
  };
  const ids = geo.features.map((f) => f.properties.id).sort((a, b) => a - b);
  if (ids.join() !== '1,2,3,4,5,6,7,8')
    errors.push(`districts.odense.geojson: expected districts 1–8, got ${ids.join(',')}`);
  for (const f of geo.features) {
    const [lo, hi] = f.properties.wildLevels;
    if (!(lo <= hi)) errors.push(`district ${f.properties.id}: wildLevels ${lo}–${hi}`);
    const r = region.districts.find((d) => d.id === f.properties.id);
    if (!r || r.wildLevels.join() !== f.properties.wildLevels.join())
      errors.push(
        `region.odense.json is stale for district ${f.properties.id}: run pnpm region:build`,
      );
  }
  for (const [cell, row] of Object.entries(region.cells)) {
    if (!region.districts.some((d) => d.id === row[0]))
      errors.push(`region cell ${cell}: unknown district ${row[0]}`);
    const sum = row.slice(2, 10).reduce((a, b) => a + b, 0);
    if (sum > 101) errors.push(`region cell ${cell}: biome shares sum to ${sum}%`);
  }
  return errors;
}

process.exit(main());
