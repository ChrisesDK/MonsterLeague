import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { cellToChildren, cellToLatLng, latLngToCell } from 'h3-js';
import { content } from './index';
import { RegionFileSchema, RegionVersionFileSchema, type RegionFile } from './schemas';
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
  const version = RegionVersionFileSchema.safeParse(read('../region/region.odense.version.json'));
  if (!version.success || version.data.dataVersion !== region.dataVersion)
    errors.push(
      'region.odense.version.json does not match region.odense.json: run pnpm region:build',
    );
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
  return [...errors, ...checkPois(region)];
}

/** Ray casting for [lng, lat] points in GeoJSON rings (outer ring + holes). */
function inRings(pt: [number, number], rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  }
  return inside;
}

function distToSegmentM(p: [number, number], a: number[], b: number[]): number {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_540;
  const ax = (a[0]! - p[0]) * kx;
  const ay = (a[1]! - p[1]) * ky;
  const dx = (b[0]! - a[0]!) * kx;
  const dy = (b[1]! - a[1]!) * ky;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** GDD placement rules: inside its district, not in a no-spawn area, ≥ 15 m from road/rail hazards. */
function checkPois(region: RegionFile): string[] {
  const errors: string[] = [];
  const read = (rel: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
  const districts = read('../content/districts.odense.geojson') as {
    features: {
      properties: { id: number };
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
    }[];
  };
  const hazards = read('../region/hazards.odense.json') as {
    lines: { kind: string; coords: number[][] }[];
  };
  for (const p of Object.values(content.pois)) {
    const where = `poi ${p.id}`;
    const pt: [number, number] = [p.lng, p.lat];
    const d = districts.features.find((f) => f.properties.id === p.district);
    const polys = !d
      ? []
      : d.geometry.type === 'Polygon'
        ? [d.geometry.coordinates as number[][][]]
        : (d.geometry.coordinates as number[][][][]);
    if (!polys.some((rings) => inRings(pt, rings)))
      errors.push(`${where}: outside district ${p.district}`);

    const cellId = latLngToCell(p.lat, p.lng, region.h3Res);
    const row = region.cells[cellId];
    if (!row) errors.push(`${where}: not in a region cell`);
    else if (row[1] === 1) errors.push(`${where}: inside a no-spawn cell`);
    else {
      // Blocked sample positions are no-spawn areas or light rail: the POI may not sit on one.
      const mask = row[10] ?? 0;
      const kids = cellToChildren(cellId, 12);
      const nearest = kids
        .map((k, i) => ({
          i,
          d: Math.hypot(...cellToLatLng(k).map((v, j) => v - (j === 0 ? p.lat : p.lng))),
        }))
        .sort((a, b) => a.d - b.d)[0]!;
      if (Math.floor(mask / 2 ** nearest.i) % 2 === 1)
        errors.push(`${where}: inside a no-spawn area`);
    }
    let nearest = Infinity;
    let kind = '';
    for (const line of hazards.lines) {
      for (let i = 0; i + 1 < line.coords.length; i++) {
        const dist = distToSegmentM(pt, line.coords[i]!, line.coords[i + 1]!);
        if (dist < nearest) [nearest, kind] = [dist, line.kind];
      }
    }
    if (nearest < 15)
      errors.push(
        `${where}: ${nearest.toFixed(0)} m from ${kind === 'rail' ? 'a railway' : 'a trunk/motorway road'} (min 15 m)`,
      );
  }
  return errors;
}

process.exit(main());
