import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { cellToChildren, cellToLatLng, latLngToCell } from 'h3-js';
import { RegionFileSchema, RegionVersionFileSchema, type RegionFile } from './schemas';
import {
  checkContent,
  checkI18n,
  checkRegionSeparation,
  i18nFor,
  parseContent,
  rawContentByRegion,
  REGION_IDS,
  type Dex,
} from './index';

/** The region being checked (P27: every region is validated on its own, from its own folders). */
let dex: Dex;

function main(): number {
  let failed = 0;
  const separation = checkRegionSeparation();
  for (const e of separation) console.error(`✗ regions: ${e}`);
  failed += separation.length;
  for (const region of REGION_IDS) {
    try {
      dex = parseContent(rawContentByRegion[region], region);
    } catch (err) {
      if (err instanceof ZodError) {
        for (const issue of err.issues)
          console.error(`✗ ${region}: schema: ${issue.path.join('.')}: ${issue.message}`);
      } else {
        console.error(err);
      }
      failed++;
      continue;
    }
    const texts = i18nFor(region);
    const errors = [...checkContent(dex), ...checkI18n(dex, texts), ...checkRegion()];
    for (const e of errors) console.error(`✗ ${region}: ${e}`);
    failed += errors.length;
    if (errors.length === 0)
      console.log(
        `✓ ${region}: ${Object.keys(dex.species).length} species, ` +
          `${Object.keys(dex.trainers).length} trainers, ${Object.keys(dex.zones).length} zones, ` +
          `${Object.keys(dex.routes).length} routes, ${Object.keys(dex.pois).length} POIs, ` +
          `${Object.keys(texts.en).length} texts × 2 locales, region file ok`,
      );
  }
  console.log(
    `  shared: ${dex.typeIds.length} types, ${Object.keys(dex.moves).length} moves, ` +
      `${Object.keys(dex.items).length} items, ${Object.keys(dex.fieldAbilities).length} field abilities`,
  );
  if (failed > 0) {
    console.error(`\n${failed} content error(s).`);
    return 1;
  }
  return 0;
}

/** Region files (built by tools/region-builder) and the district polygons they came from. */
function checkRegion(): string[] {
  const errors: string[] = [];
  const read = (rel: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
  if (!existsSync(fileURLToPath(new URL(`../region/${dex.region}/region.json`, import.meta.url))))
    return [`no region file yet: run pnpm region:build --region ${dex.region}`];
  const parsed = RegionFileSchema.safeParse(read(`../region/${dex.region}/region.json`));
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 5))
      errors.push(`region.json: ${i.path.join('.')}: ${i.message}`);
    return errors;
  }
  const region = parsed.data;
  const version = RegionVersionFileSchema.safeParse(read(`../region/${dex.region}/version.json`));
  if (!version.success || version.data.dataVersion !== region.dataVersion)
    errors.push('version.json does not match region.json: run pnpm region:build');
  const geo = read(`../content/${dex.region}/districts.geojson`) as {
    features: { properties: { id: number; wildLevels: [number, number]; draft: boolean } }[];
  };
  const ids = geo.features.map((f) => f.properties.id).sort((a, b) => a - b);
  if (ids.join() !== '1,2,3,4,5,6,7,8')
    errors.push(`districts.geojson: expected districts 1–8, got ${ids.join(',')}`);
  for (const f of geo.features) {
    const [lo, hi] = f.properties.wildLevels;
    if (!(lo <= hi)) errors.push(`district ${f.properties.id}: wildLevels ${lo}–${hi}`);
    const r = region.districts.find((d) => d.id === f.properties.id);
    if (!r || r.wildLevels.join() !== f.properties.wildLevels.join())
      errors.push(`region.json is stale for district ${f.properties.id}: run pnpm region:build`);
  }
  const zoneIds = Object.keys(dex.zones);
  if (region.zones.join() !== zoneIds.join())
    errors.push('region.json zones differ from zones.json: run pnpm region:build');
  for (const [cell, row] of Object.entries(region.cells)) {
    if (!region.districts.some((d) => d.id === row[0]))
      errors.push(`region cell ${cell}: unknown district ${row[0]}`);
    const zone = dex.zones[region.zones[row[1]!] ?? ''];
    if (!zone || zone.district !== row[0])
      errors.push(`region cell ${cell}: zone ${row[1]} is not in district ${row[0]}`);
    const sum = row.slice(3, 11).reduce((a, b) => a + b, 0);
    if (sum > 101) errors.push(`region cell ${cell}: biome shares sum to ${sum}%`);
  }
  return [...errors, ...checkPois(region), ...checkRoutes(region)];
}

/**
 * Routes (P22): start and end inside their two zones, stay inside the region (up to 600 m
 * outside, e.g. the causeway to Stige Ø), and never run along a railway or motorway:
 * crossing one, also on a bridge with its ramps, is fine, so the longest continuous stretch
 * within 12 m of one may be at most 100 m. Length and wild share must match the path.
 */
function checkRoutes(region: RegionFile): string[] {
  const errors: string[] = [];
  const hazards = (
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../region/${dex.region}/hazards.json`, import.meta.url)),
        'utf8',
      ),
    ) as { lines: { coords: number[][] }[] }
  ).lines;
  const m = (a: number[], b: number[]) =>
    Math.hypot(
      (a[1]! - b[1]!) * 110_540,
      (a[0]! - b[0]!) * 111_320 * Math.cos((a[1]! * Math.PI) / 180),
    );
  const zoneOf = (p: number[]) => {
    const row = region.cells[latLngToCell(p[1]!, p[0]!, region.h3Res)];
    return row ? region.zones[row[1]!] : undefined;
  };
  for (const r of Object.values(dex.routes)) {
    const where = `route ${r.id}`;
    if (r.kind === 'ferry') {
      // P27: a crossing to an island that opens on arrival; drawn over the water, not walked
      const to = dex.zones[r.to];
      if (!to?.opensOnArrival) errors.push(`${where}: a ferry must lead to an island zone`);
      if (zoneOf(r.path[0]!) !== r.from) errors.push(`${where}: does not start in zone ${r.from}`);
      if (zoneOf(r.path[r.path.length - 1]!) !== r.to)
        errors.push(`${where}: does not end in zone ${r.to}`);
      continue;
    }
    if (zoneOf(r.path[0]!) !== r.from) errors.push(`${where}: does not start in zone ${r.from}`);
    if (zoneOf(r.path[r.path.length - 1]!) !== r.to)
      errors.push(`${where}: does not end in zone ${r.to}`);
    let length = 0;
    let nearHazard = 0;
    let run = 0;
    let wild = 0;
    let samples = 0;
    let outside = 0;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!;
      const b = r.path[i]!;
      const d = m(a, b);
      length += d;
      const n = Math.max(1, Math.ceil(d / 5));
      for (let k = 1; k <= n; k++) {
        const p: [number, number] = [
          a[0] + ((b[0] - a[0]) * k) / n,
          a[1] + ((b[1] - a[1]) * k) / n,
        ];
        const row = region.cells[latLngToCell(p[1], p[0], region.h3Res)];
        samples++;
        if (!row) {
          outside++;
          continue;
        }
        if (row[2]! & 2) wild++;
        let near = Infinity;
        for (const line of hazards)
          for (let j = 0; j + 1 < line.coords.length; j++)
            near = Math.min(near, distToSegmentM(p, line.coords[j]!, line.coords[j + 1]!));
        if (near < 12) {
          run += d / n;
          nearHazard = Math.max(nearHazard, run);
        } else run = 0;
      }
    }
    // A causeway or a path along the border may run just outside the region's cells.
    if (outside * 5 > 600)
      errors.push(`${where}: ${outside * 5} m run outside the region (max 600 m)`);
    if (nearHazard > 100)
      errors.push(
        `${where}: ${nearHazard.toFixed(0)} m run along a railway or motorway (max 100 m in a row)`,
      );
    if (Math.abs(length - r.lengthM) > Math.max(5, r.lengthM * 0.02))
      errors.push(`${where}: lengthM ${r.lengthM} but the path is ${length.toFixed(0)} m`);
    if (Math.abs(wild / samples - r.wildShare) > 0.05)
      errors.push(
        `${where}: wildShare ${r.wildShare} but the region says ${(wild / samples).toFixed(2)}`,
      );
  }
  return errors;
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

/**
 * GDD placement rules (P22: zones): inside its zone with the whole radius, not in a no-spawn
 * area, ≥ 15 m from road/rail hazards.
 */
function checkPois(region: RegionFile): string[] {
  const errors: string[] = [];
  const read = (rel: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
  const zones = read(`../content/${dex.region}/zones.geojson`) as {
    features: {
      properties: { id: string };
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
    }[];
  };
  const hazards = read(`../region/${dex.region}/hazards.json`) as {
    lines: { kind: string; coords: number[][] }[];
  };
  for (const p of Object.values(dex.pois)) {
    const where = `poi ${p.id}`;
    const pt: [number, number] = [p.lng, p.lat];
    const d = zones.features.find((f) => f.properties.id === p.zone);
    const polys = !d
      ? []
      : d.geometry.type === 'Polygon'
        ? [d.geometry.coordinates as number[][][]]
        : (d.geometry.coordinates as number[][][][]);
    if (!polys.some((rings) => inRings(pt, rings))) errors.push(`${where}: outside zone ${p.zone}`);
    else {
      // The whole interaction radius must stay inside the zone (GDD v1.7 / M2c, P22).
      let edge = Infinity;
      for (const rings of polys)
        for (const ring of rings)
          for (let i = 0; i + 1 < ring.length; i++)
            edge = Math.min(edge, distToSegmentM(pt, ring[i]!, ring[i + 1]!));
      if (edge < p.radius)
        errors.push(
          `${where}: its ${p.radius} m radius crosses the zone border (${edge.toFixed(0)} m away)`,
        );
    }

    const cellId = latLngToCell(p.lat, p.lng, region.h3Res);
    const row = region.cells[cellId];
    if (!row) errors.push(`${where}: not in a region cell`);
    else if (region.zones[row[1]!] !== p.zone)
      errors.push(`${where}: its map cell counts as zone ${region.zones[row[1]!]}, not ${p.zone}`);
    else if ((row[2]! & 1) === 1) errors.push(`${where}: inside a no-spawn cell`);
    else {
      // Blocked sample positions are no-spawn areas or light rail: the POI may not sit on one.
      const mask = row[11] ?? 0;
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
