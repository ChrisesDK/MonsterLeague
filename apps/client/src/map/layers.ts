/**
 * Game layers shared by the play view and the Town Map (M2d, P22): district and zone borders,
 * locked zones dimmed, wild areas drawn as grass or ripples ("tall grass"), dotted routes
 * whose walked part is drawn solid (the progress bar) and the player's accuracy ring.
 */
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { content } from '@oml/data';
import { routeCheckpoints, type SaveGame } from '@oml/game';
import districtsRaw from '@oml/data/content/districts.odense.geojson?raw';
import zonesRaw from '@oml/data/content/zones.odense.geojson?raw';
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

export const zonesGeo = JSON.parse(zonesRaw) as GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: string; district: number; kind: string }
>;

export const routesGeo: GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  { id: string; number: number; kind: string }
> = {
  type: 'FeatureCollection',
  features: Object.values(content.routes).map((r) => ({
    type: 'Feature',
    properties: { id: r.id, number: r.number, kind: r.kind },
    geometry: { type: 'LineString', coordinates: r.path },
  })),
};

/**
 * One label point per zone (its centre) and per district (its arena site): the outlines are
 * multi-part, and a label per part repeated names (P22).
 */
export function zonePoints(label: (id: string) => string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(content.zones).map((z) => ({
      type: 'Feature',
      properties: { id: z.id, name: glyphSafe(label(z.id)) },
      geometry: { type: 'Point', coordinates: [z.lng, z.lat] },
    })),
  };
}
export function districtPoints(label: (id: number) => string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: content.arenaSites.map((a) => ({
      type: 'Feature',
      properties: { id: a.district, name: glyphSafe(label(a.district)) },
      geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
    })),
  };
}

/**
 * The walked parts of every route (P22 progress bar): a piece between two neighbouring
 * checkpoints is drawn once both were reached.
 */
export function walkedGeo(save: Pick<SaveGame, 'journal'>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const r of Object.values(content.routes)) {
    const got = new Set(save.journal.routes[r.id] ?? []);
    if (got.size < 2) continue;
    const cps = routeCheckpoints(r);
    const lines: [number, number][][] = [];
    let cur: [number, number][] | null = null;
    for (let i = 1; i < cps.length; i++) {
      if (got.has(i - 1) && got.has(i)) {
        if (!cur) {
          cur = [[cps[i - 1]!.lng, cps[i - 1]!.lat]];
          lines.push(cur);
        }
        cur.push([cps[i]!.lng, cps[i]!.lat]);
      } else cur = null;
    }
    if (lines.length)
      features.push({
        type: 'Feature',
        properties: { id: r.id },
        geometry: { type: 'MultiLineString', coordinates: lines },
      });
  }
  return { type: 'FeatureCollection', features };
}

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
    zoneName: (id: string) => string;
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
  map.addSource('zones', {
    type: 'geojson',
    data: {
      ...zonesGeo,
      features: zonesGeo.features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: glyphSafe(opts.zoneName(f.properties.id)) },
      })),
    },
  });
  map.addLayer({
    id: 'locked-zones',
    type: 'fill',
    source: 'zones',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'fill-color': p.locked, 'fill-opacity': opts.mode === 'town' ? 0.2 : 0.12 },
  });
  if (opts.mode === 'town')
    map.addLayer({
      id: 'zone-lines',
      type: 'line',
      source: 'zones',
      minzoom: 11.5,
      paint: { 'line-color': p.district, 'line-width': 1, 'line-opacity': 0.35 },
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
      'line-color': ['case', ['==', ['get', 'kind'], 'explore'], p.routeDraft, p.route],
      'line-width':
        opts.mode === 'town'
          ? ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4]
          : ['interpolate', ['linear'], ['zoom'], 15, 3, 18.5, 7],
      // dotted: round caps on near-zero dashes
      'line-dasharray': [0.1, 2],
      'line-opacity': 0.9,
    },
  });
  // The walked part of each route, solid (P22: the route fills in as it is walked).
  map.addSource('routes-walked', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'routes-walked',
    type: 'line',
    source: 'routes-walked',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': p.route,
      'line-width':
        opts.mode === 'town'
          ? ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5]
          : ['interpolate', ['linear'], ['zoom'], 15, 4, 18.5, 9],
      'line-opacity': 0.95,
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
      'text-color': ['case', ['==', ['get', 'kind'], 'explore'], p.routeDraft, p.route],
      'text-halo-color': p.halo,
      'text-halo-width': 2,
    },
  });
  if (opts.mode === 'town') {
    map.addSource('zone-points', { type: 'geojson', data: zonePoints(opts.zoneName) });
    map.addSource('district-points', { type: 'geojson', data: districtPoints(opts.districtName) });
    map.addLayer({
      id: 'zone-labels',
      type: 'symbol',
      source: 'zone-points',
      minzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 12,
        'text-max-width': 8,
        // below the zone's centre (arena zones: below the arena badge)
        'text-offset': [0, 1.8],
        'text-anchor': 'top',
      },
      paint: { 'text-color': p.district, 'text-halo-color': p.halo, 'text-halo-width': 2 },
    });
    map.addLayer({
      id: 'district-labels',
      type: 'symbol',
      source: 'district-points',
      maxzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 14,
        'text-max-width': 8,
        // below the arena badge it is placed at
        'text-offset': [0, 2],
        'text-anchor': 'top',
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
  (map.getSource('district-points') as GeoJSONSource | undefined)?.setData(districtPoints(label));
}

/** Dims the zones the player hasn't opened yet (P22). */
export function setLockedZones(map: MlMap, locked: string[]): void {
  if (!map.getLayer('locked-zones')) return;
  map.setFilter('locked-zones', ['in', ['get', 'id'], ['literal', locked.length ? locked : ['']]]);
}

/** Zone labels (Town Map: locked ones say how to open them). */
export function setZoneLabels(map: MlMap, label: (id: string) => string): void {
  (map.getSource('zone-points') as GeoJSONSource | undefined)?.setData(zonePoints(label));
}

/** Draws the walked parts of the routes (call when the save's route progress changes). */
export function setRouteProgress(map: MlMap, save: Pick<SaveGame, 'journal'>): void {
  (map.getSource('routes-walked') as GeoJSONSource | undefined)?.setData(walkedGeo(save));
}

/** Palette switch for the generated pattern images (layers use applyPalette). */
export function applyPatternPalette(map: MlMap, p: Palette): void {
  if (map.hasImage('wild-grass')) setPatterns(map, p);
}

/**
 * Building height in metres for the 3D layer: the OSM height when the data has one (about
 * one building in ten in Odense), otherwise a typical height for the building's kind, with a
 * little variation from the house number so a street doesn't look like a row of blocks.
 * Everything is drawn at BUILDING_SCALE: storybook-low buildings keep the street around the
 * player readable under the tilted camera (full height hid the foreground in the centre).
 */
export const BUILDING_SCALE = 0.55;
export const BUILDING_HEIGHT = [
  '*',
  BUILDING_SCALE,
  [
    'min',
    55,
    [
      'coalesce',
      ['get', 'height'],
      [
        '+',
        [
          'match',
          ['coalesce', ['get', 'kind_detail'], ''],
          ['garage', 'garages', 'shed', 'carport', 'hut', 'roof', 'kiosk'],
          3,
          ['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm'],
          7,
          ['apartments', 'dormitory', 'hotel', 'hospital', 'university'],
          14,
          ['commercial', 'retail', 'office', 'public', 'civic', 'school', 'train_station'],
          12,
          ['industrial', 'warehouse', 'manufacture', 'service'],
          8,
          ['church', 'cathedral', 'chapel'],
          18,
          9,
        ],
        ['*', 1.5, ['%', ['to-number', ['coalesce', ['get', 'addr_housenumber'], 0], 0], 3]],
      ],
    ],
  ],
] as const;

/**
 * 3D buildings for the play view (owner request; an opt-in setting): a GPU-drawn fill-extrusion layer on the
 * basemap's buildings. The tiles (zoom 14–15, overzoomed) already simplify the shapes, so
 * there is one cheap mesh per tile. Added last, so buildings hide routes and wild areas
 * behind them; the creature and stamp icons stay on top (they are HTML).
 */
export function addBuildings3d(map: MlMap, p: Palette, on: boolean): void {
  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',
    source: 'protomaps',
    'source-layer': 'buildings',
    minzoom: 14.5,
    paint: {
      'fill-extrusion-color': p.building3d,
      'fill-extrusion-height': BUILDING_HEIGHT as never,
      'fill-extrusion-base': [
        '*',
        BUILDING_SCALE,
        ['min', ['coalesce', ['get', 'min_height'], 0], 54],
      ] as never,
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-opacity': 1,
    },
  });
  // Labels that stand up and face the camera (place and water names) go above the
  // buildings, so they are never hidden inside a block.
  for (const id of ['water-labels', 'place-labels']) if (map.getLayer(id)) map.moveLayer(id);
  setBuildings3d(map, on);
}

/** The 3D buildings setting (opt-in): 3D blocks, or the flat building outlines. */
export function setBuildings3d(map: MlMap, on: boolean): void {
  if (map.getLayer('buildings-3d'))
    map.setLayoutProperty('buildings-3d', 'visibility', on ? 'visible' : 'none');
  if (map.getLayer('buildings'))
    map.setLayoutProperty('buildings', 'visibility', on ? 'none' : 'visible');
}

/**
 * Distance fog (owner idea: a fog barrier and a sky for a round world, like walking games).
 * A static wall at FOG_M around the player, drawn in screen space by the play view's frame
 * loop (see fogWall in orbit.ts): clear inside, fog and sky outside. It covers distant
 * buildings, labels and icons and costs nothing per frame. (Earlier versions faded in, or
 * drew kilometre-wide fog polygons on the map, whose tiling made zooming lag.) The map
 * background past the horizon takes the fog colour.
 */
/**
 * The edge of the world (owner request): a wall around the player at every zoom, painted
 * with the sky's gradient so it is practically invisible (fogWall.ts). Its distance is a
 * setting (800–1,400 m, default FOG_M); 3D buildings load and unload at the wall itself.
 */
export const FOG_M = 1200;
export const BUILDINGS_BEHIND_M = 0;
/** The fog wall's distance [start, end] in metres (one distance; kept as a pair). */
export function fogRadii(distanceM = FOG_M): [number, number] {
  return [distanceM, distanceM];
}
/** Where 3D buildings load and unload, for a fog distance. */
export function buildingsRadius(fogM = FOG_M): number {
  return fogM + BUILDINGS_BEHIND_M;
}

/** The building filter is re-centred after walking this far (each change re-processes tiles). */
export const BUILDINGS_RECENTRE_M = 100;

/**
 * Unloads 3D buildings beyond the fog: only buildings within `radiusM` (the fog distance) of `c` are
 * drawn. Re-centred every 100 m walked, so buildings never go missing in front of the wall.
 */
export function setBuildingsRange(
  map: MlMap,
  c: { lat: number; lng: number },
  radiusM = buildingsRadius(),
): void {
  if (!map.getLayer('buildings-3d')) return;
  map.setFilter('buildings-3d', [
    '<',
    ['distance', { type: 'Point', coordinates: [c.lng, c.lat] }],
    radiusM,
  ] as never);
}

/** Background past the horizon in the fog colour (the fog itself is the .map-fog overlay). */
export function setFogPalette(map: MlMap, p: Palette): void {
  if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', p.fog);
}
