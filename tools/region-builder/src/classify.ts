import { booleanPointInPolygon } from '@turf/turf';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { cellToChildren, cellToLatLng } from 'h3-js';
import RBush from 'rbush';
import { BIOME_PRIORITY, BUFFERS_M, NO_SPAWN_SHARE, type Biome } from './config';

type Tags = Record<string, string | undefined>;

/**
 * OSM sometimes has a polygon ring that doesn't end where it starts (a mapping slip; met in
 * Svendborg, P27). Close such rings, and drop rings too short to be an area.
 */
export function closeRings(g: Geometry | null): Geometry | null {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return g;
  const fix = (rings: Position[][]) =>
    rings
      .map((r) => {
        const a = r[0];
        const b = r[r.length - 1];
        return a && b && (a[0] !== b[0] || a[1] !== b[1]) ? [...r, a] : r;
      })
      .filter((r) => r.length >= 4);
  if (g.type === 'Polygon') {
    const rings = fix(g.coordinates);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  const polys = g.coordinates.map(fix).filter((p) => p.length > 0);
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

/** What a feature contributes: a biome, a noSpawn zone, or both. */
export interface Rule {
  biome?: Biome;
  noSpawn?: boolean;
  /** Blocks spawn positions without counting toward the cell's noSpawn share (light rail). */
  blockSpawn?: boolean;
  /** Radius in metres for lines and points (and the edge band of buffered areas). */
  buffer?: number;
}

const NO_SPAWN_AMENITY =
  /^(school|kindergarten|childcare|hospital|grave_yard|nursing_home|prison|place_of_worship)$/;
/** D170 (owner request): care homes mapped as social facilities. */
const NO_SPAWN_SOCIAL = /^(nursing_home|assisted_living)$/;

/** Area (polygon) rules from OSM tags. */
export function areaRules(tags: Tags): Rule[] {
  const rules: Rule[] = [];
  const { natural, landuse, leisure, waterway, amenity } = tags;
  if (
    natural === 'water' ||
    natural === 'bay' ||
    tags.water ||
    waterway === 'riverbank' ||
    waterway === 'dock'
  )
    rules.push({ biome: 'water' });
  else if (landuse === 'reservoir' || landuse === 'basin') rules.push({ biome: 'water' });
  else if (landuse === 'forest' || natural === 'wood') rules.push({ biome: 'forest' });
  else if (leisure === 'park' || leisure === 'garden' || landuse === 'recreation_ground')
    rules.push({ biome: 'park' });
  else if (
    landuse === 'meadow' ||
    landuse === 'grass' ||
    landuse === 'village_green' ||
    natural === 'grassland' ||
    natural === 'heath' ||
    natural === 'scrub'
  )
    rules.push({ biome: 'meadow' });
  else if (landuse === 'farmland' || landuse === 'orchard') rules.push({ biome: 'farmland' });
  else if (
    landuse === 'industrial' ||
    landuse === 'port' ||
    landuse === 'harbour' ||
    landuse === 'railway'
  )
    rules.push({ biome: 'industrial' });
  else if (landuse === 'residential' || landuse === 'retail' || landuse === 'commercial')
    rules.push({ biome: 'urban' });
  if (tags.historic && tags.historic !== 'no')
    rules.push({ biome: 'historic', buffer: BUFFERS_M.historic });
  if (
    (amenity && NO_SPAWN_AMENITY.test(amenity)) ||
    tags.healthcare === 'hospital' ||
    (tags.social_facility !== undefined && NO_SPAWN_SOCIAL.test(tags.social_facility)) ||
    landuse === 'cemetery' ||
    // D170 (owner request): private plots, golf courses, prisons and campsites
    landuse === 'allotments' ||
    leisure === 'golf_course' ||
    tags.tourism === 'camp_site' ||
    tags.tourism === 'caravan_site' ||
    landuse === 'military' ||
    tags.military ||
    tags.aeroway === 'aerodrome'
  )
    rules.push({ noSpawn: true });
  return rules;
}

/** Line rules: rivers and streams become water bands; rail and major roads become noSpawn. */
export function lineRules(tags: Tags): Rule[] {
  const rules: Rule[] = [];
  if (tags.waterway === 'river') rules.push({ biome: 'water', buffer: BUFFERS_M.river });
  if (tags.waterway === 'canal') rules.push({ biome: 'water', buffer: BUFFERS_M.canal });
  if (tags.waterway === 'stream') rules.push({ biome: 'water', buffer: BUFFERS_M.stream });
  if (tags.railway === 'rail') rules.push({ noSpawn: true, buffer: BUFFERS_M.railway });
  if (tags.railway === 'light_rail' || tags.railway === 'tram')
    rules.push({ blockSpawn: true, buffer: BUFFERS_M.lightRail });
  if (tags.highway && /^(motorway|trunk)(_link)?$/.test(tags.highway))
    rules.push({ noSpawn: true, buffer: BUFFERS_M.majorRoad });
  if (tags.historic && tags.historic !== 'no')
    rules.push({ biome: 'historic', buffer: BUFFERS_M.historic });
  return rules;
}

/** Point rules: historic points and noSpawn amenities mapped as nodes get a radius. */
export function pointRules(tags: Tags): Rule[] {
  const rules: Rule[] = [];
  if (tags.historic && tags.historic !== 'no')
    rules.push({ biome: 'historic', buffer: BUFFERS_M.historic });
  const area = areaRules(tags).filter((r) => r.noSpawn);
  if (area.length) rules.push({ noSpawn: true, buffer: BUFFERS_M.noSpawnPoint });
  return rules;
}

// ---------------------------------------------------------------------------------------
// Spatial index
// ---------------------------------------------------------------------------------------

interface AreaItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  geometry: Polygon | MultiPolygon;
  rule: Rule;
}

interface SegItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  a: Position;
  b: Position;
  rule: Rule & { buffer: number };
}

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Distance in metres from point p to segment ab (local equirectangular projection). */
export function distanceToSegmentM(p: Position, a: Position, b: Position): number {
  const kx = mPerDegLon(p[1]!);
  const ax = (a[0]! - p[0]!) * kx;
  const ay = (a[1]! - p[1]!) * M_PER_DEG_LAT;
  const bx = (b[0]! - p[0]!) * kx;
  const by = (b[1]! - p[1]!) * M_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function bboxOf(coords: Position[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x!);
    minY = Math.min(minY, y!);
    maxX = Math.max(maxX, x!);
    maxY = Math.max(maxY, y!);
  }
  return [minX, minY, maxX, maxY];
}

export class FeatureIndex {
  private areas = new RBush<AreaItem>();
  private segs = new RBush<SegItem>();
  readonly counts = { areas: 0, segments: 0, ignored: 0 };

  addFeature(feature: Feature<Geometry | null>): void {
    const tags = (feature.properties ?? {}) as Tags;
    const g = closeRings(feature.geometry);
    if (!g) return;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const rules = areaRules(tags);
      if (!rules.length) return void this.counts.ignored++;
      const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
      const [minX, minY, maxX, maxY] = bboxOf(rings.flat());
      for (const rule of rules) {
        this.areas.insert({ minX, minY, maxX, maxY, geometry: g, rule });
        this.counts.areas++;
        if (rule.buffer)
          for (const ring of rings) this.addLine(ring, { ...rule, buffer: rule.buffer });
      }
    } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const rules = lineRules(tags);
      if (!rules.length) return void this.counts.ignored++;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      for (const rule of rules)
        for (const line of lines) this.addLine(line, { ...rule, buffer: rule.buffer! });
    } else if (g.type === 'Point') {
      const rules = pointRules(tags);
      if (!rules.length) return void this.counts.ignored++;
      for (const rule of rules)
        this.addLine([g.coordinates, g.coordinates], { ...rule, buffer: rule.buffer! });
    } else this.counts.ignored++;
  }

  private addLine(line: Position[], rule: Rule & { buffer: number }) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const lat = (a[1]! + b[1]!) / 2;
      const padX = rule.buffer / mPerDegLon(lat);
      const padY = rule.buffer / M_PER_DEG_LAT;
      this.segs.insert({
        minX: Math.min(a[0]!, b[0]!) - padX,
        minY: Math.min(a[1]!, b[1]!) - padY,
        maxX: Math.max(a[0]!, b[0]!) + padX,
        maxY: Math.max(a[1]!, b[1]!) + padY,
        a,
        b,
        rule,
      });
      this.counts.segments++;
    }
  }

  /** Biomes and noSpawn at one point ([lon, lat]). */
  query(p: Position): { biomes: Set<Biome>; noSpawn: boolean; blockSpawn: boolean } {
    const biomes = new Set<Biome>();
    let noSpawn = false;
    let blockSpawn = false;
    const box = { minX: p[0]!, minY: p[1]!, maxX: p[0]!, maxY: p[1]! };
    for (const item of this.areas.search(box)) {
      if (item.rule.biome && biomes.has(item.rule.biome) && !item.rule.noSpawn) continue;
      if (!booleanPointInPolygon(p, item.geometry)) continue;
      if (item.rule.biome) biomes.add(item.rule.biome);
      if (item.rule.noSpawn) noSpawn = true;
    }
    for (const item of this.segs.search(box)) {
      if (distanceToSegmentM(p, item.a, item.b) > item.rule.buffer) continue;
      if (item.rule.biome) biomes.add(item.rule.biome);
      if (item.rule.noSpawn) noSpawn = true;
      if (item.rule.blockSpawn) blockSpawn = true;
    }
    return { biomes, noSpawn, blockSpawn };
  }
}

/** Area shares of each biome in one res-10 cell (percent, by sample points) and noSpawn. */
export interface CellClass {
  shares: Partial<Record<Biome, number>>;
  /** GDD P10: at least NO_SPAWN_SHARE of the cell lies in no-spawn areas. */
  noSpawn: boolean;
  /** Share of samples (0–1) inside no-spawn areas. */
  noSpawnShare: number;
  /**
   * Indices (in `cellToChildren(cell, sampleRes)` order) of sample positions where no spawn
   * may be placed: inside a no-spawn area or on light-rail/tram tracks (GDD P10, P11).
   */
  blocked: number[];
  samples: number;
}

/** Blocked sample indices as one integer bit mask (49 samples fit exactly in a double). */
export function blockedMask(blocked: readonly number[]): number {
  let mask = 0;
  for (const i of blocked) mask += 2 ** i;
  return mask;
}

export function classifyCell(index: FeatureIndex, cell: string, sampleRes: number): CellClass {
  const children = cellToChildren(cell, sampleRes);
  const counts: Partial<Record<Biome, number>> = {};
  let noSpawnSamples = 0;
  const blocked: number[] = [];
  children.forEach((child, i) => {
    const [lat, lng] = cellToLatLng(child);
    const hit = index.query([lng, lat]);
    if (hit.noSpawn) noSpawnSamples++;
    if (hit.noSpawn || hit.blockSpawn) blocked.push(i);
    const biome = BIOME_PRIORITY.find((b) => hit.biomes.has(b));
    if (biome) counts[biome] = (counts[biome] ?? 0) + 1;
  });
  const shares: Partial<Record<Biome, number>> = {};
  for (const [b, n] of Object.entries(counts) as [Biome, number][]) {
    const pct = Math.round((100 * n) / children.length);
    if (pct > 0) shares[b] = pct;
  }
  const noSpawnShare = noSpawnSamples / children.length;
  return {
    shares,
    noSpawn: noSpawnShare >= NO_SPAWN_SHARE,
    noSpawnShare,
    blocked,
    samples: children.length,
  };
}
