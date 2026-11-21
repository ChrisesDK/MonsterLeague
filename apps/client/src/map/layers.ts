/**
 * Game layers shared by the play view and the Town Map (M2d): district borders, wild areas
 * drawn as grass or ripples ("tall grass"), dotted routes and the player's accuracy ring.
 */
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { content } from '@oml/data';
import districtsRaw from '@oml/data/content/districts.odense.geojson?raw';
import type { Region } from '@oml/spawn';
import { cellsToMultiPolygon } from 'h3-js';
import type { Palette } from './style';

/**
 * Map labels may only use characters in the glyph ranges we ship (public/fonts: U+0000–01FF);
 * anything else would request a missing range. Dashes become hyphens.
 */
export function glyphSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x2010 && c <= 0x2015) out += '-';
    else if (c <= 0x1ff) out += ch;
  }
  return out;
}

export const districtsGeo = JSON.parse(districtsRaw) as GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number }
>;

export const routesGeo: GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  { id: string; number: number; draft: boolean }
> = {
  type: 'FeatureCollection',
  features: Object.values(content.routes).map((r) => ({
    type: 'Feature',
    properties: { id: r.id, number: r.number, draft: r.draft },
    geometry: { type: 'LineString', coordinates: r.path },
  })),
};

const wildCache = new WeakMap<Region, GeoJSON.FeatureCollection>();
/** Wild-area outlines from the region flags, merged into multipolygons (computed once). */
export function wildGeo(region: Region): GeoJSON.FeatureCollection {
  const cached = wildCache.get(region);
  if (cached) return cached;
  const grass: string[] = [];
  const water: string[] = [];
  for (const c of region.cells.values()) {
    if (!c.wild || c.noSpawn) continue;
    (c.waterEdge ? water : grass).push(c.id);
  }
  const feature = (cells: string[], kind: string): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { kind },
    geometry: { type: 'MultiPolygon', coordinates: cellsToMultiPolygon(cells, true) },
  });
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [feature(grass, 'grass'), feature(water, 'water')],
  };
  wildCache.set(region, fc);
  return fc;
}

/** Small hand-drawn-looking pattern tiles for wild areas (generated, no image files). */
function pattern(kind: 'grass' | 'water', ink: string): ImageData | null {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (kind === 'grass') {
    // two little tufts per tile, offset so the texture doesn't read as a grid
    for (const [x, y] of [
      [14, 22],
      [46, 54],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.quadraticCurveTo(x - 5, y - 6, x - 8, y - 9);
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x, y - 8, x + 1, y - 12);
      ctx.moveTo(x + 5, y);
      ctx.quadraticCurveTo(x + 5, y - 6, x + 8, y - 8);
      ctx.stroke();
    }
  } else {
    for (const [x, y] of [
      [14, 18],
      [44, 48],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.moveTo(x - 4 + 10, y + 6);
      ctx.arc(x + 6, y + 6, 4, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

function setPatterns(map: MlMap, p: Palette) {
  for (const [id, kind, ink] of [
    ['wild-grass', 'grass', p.wildInk],
    ['wild-water', 'water', p.rippleInk],
  ] as const) {
    const img = pattern(kind, ink);
    if (!img) continue;
    if (map.hasImage(id)) map.updateImage(id, img);
    else map.addImage(id, img, { pixelRatio: 2 });
  }
}

/** Adds the game layers to a loaded map. `mode` decides labels and widths. */
export function addWorldLayers(
  map: MlMap,
  p: Palette,
  opts: {
    mode: 'play' | 'town';
    districtName: (id: number) => string;
    routeName: (id: string) => string;
  },
): void {
  setPatterns(map, p);
  map.addSource('wild', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'wild-fill',
    type: 'fill',
    source: 'wild',
    paint: {
      'fill-pattern': ['case', ['==', ['get', 'kind'], 'water'], 'wild-water', 'wild-grass'],
      'fill-opacity': opts.mode === 'town' ? 0.45 : 0.55,
    },
  });
  map.addSource('districts', {
    type: 'geojson',
    data: {
      ...districtsGeo,
      features: districtsGeo.features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: glyphSafe(opts.districtName(f.properties.id)) },
      })),
    },
  });
  map.addLayer({
    id: 'locked-districts',
    type: 'fill',
    source: 'districts',
    filter: ['==', ['get', 'id'], -1],
    paint: { 'fill-color': p.locked, 'fill-opacity': opts.mode === 'town' ? 0.16 : 0.12 },
  });
  map.addLayer({
    id: 'districts',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': p.district,
      'line-width': opts.mode === 'town' ? 2.5 : 2,
      'line-dasharray': [3, 2],
      'line-opacity': 0.75,
    },
  });
  map.addSource('routes', {
    type: 'geojson',
    data: {
      ...routesGeo,
      features: routesGeo.features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: glyphSafe(opts.routeName(f.properties.id)) },
      })),
    },
  });
  map.addLayer({
    id: 'routes',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['get', 'draft'], p.routeDraft, p.route],
      'line-width':
        opts.mode === 'town' ? 4 : ['interpolate', ['linear'], ['zoom'], 15, 3, 18.5, 7],
      // dotted: round caps on near-zero dashes
      'line-dasharray': [0.1, 2],
      'line-opacity': ['case', ['get', 'draft'], 0.6, 0.95],
    },
  });
  map.addLayer({
    id: 'route-labels',
    type: 'symbol',
    source: 'routes',
    minzoom: opts.mode === 'town' ? 12.5 : 15,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Medium'],
      'text-size': 13,
      'symbol-placement': 'line',
      'symbol-spacing': 400,
    },
    paint: {
      'text-color': ['case', ['get', 'draft'], p.routeDraft, p.route],
      'text-halo-color': p.halo,
      'text-halo-width': 2,
    },
  });
  if (opts.mode === 'town') {
    map.addLayer({
      id: 'district-labels',
      type: 'symbol',
      source: 'districts',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 14,
        'text-max-width': 8,
      },
      paint: { 'text-color': p.district, 'text-halo-color': p.halo, 'text-halo-width': 2 },
    });
  }
}

/** Fills the wild-area layer once the region file has loaded. */
export function setWild(map: MlMap, region: Region | null): void {
  if (!region) return;
  (map.getSource('wild') as GeoJSONSource | undefined)?.setData(wildGeo(region));
}

/** District labels (Town Map: locked ones also name the badge they need). */
export function setDistrictLabels(map: MlMap, label: (id: number) => string): void {
  (map.getSource('districts') as GeoJSONSource | undefined)?.setData({
    ...districtsGeo,
    features: districtsGeo.features.map((f) => ({
      ...f,
      properties: { ...f.properties, name: glyphSafe(label(f.properties.id)) },
    })),
  });
}

/** Dims the districts the player hasn't unlocked yet. */
export function setLockedDistricts(map: MlMap, locked: number[]): void {
  if (!map.getLayer('locked-districts')) return;
  map.setFilter('locked-districts', [
    'in',
    ['get', 'id'],
    ['literal', locked.length ? locked : [-1]],
  ]);
}

/** Palette switch for the generated pattern images (layers use applyPalette). */
export function applyPatternPalette(map: MlMap, p: Palette): void {
  if (map.hasImage('wild-grass')) setPatterns(map, p);
}
