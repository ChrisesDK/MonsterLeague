import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';

/**
 * "Paper" map style for the Protomaps basemap (schema v4), with a day and a night palette
 * (M2d). Calm cream tones by day, deep blue ink at night; water, parks and forest stand out
 * because they decide which creatures live there (GDD "Art").
 */
export interface Palette {
  background: string;
  earth: string;
  water: string;
  waterLine: string;
  park: string;
  forest: string;
  grass: string;
  farmland: string;
  cemetery: string;
  industrial: string;
  pedestrian: string;
  building: string;
  buildingLine: string;
  road: string;
  roadCase: string;
  major: string;
  path: string;
  rail: string;
  label: string;
  waterLabel: string;
  halo: string;
  district: string;
  route: string;
  routeDraft: string;
  wildInk: string;
  rippleInk: string;
  accuracy: string;
  locked: string;
}

export const PAPER: Palette = {
  background: '#f3ead6',
  earth: '#f3ead6',
  water: '#8cc3e6',
  waterLine: '#5aa6d6',
  park: '#bfdc9f',
  forest: '#97c183',
  grass: '#d3e6b5',
  farmland: '#ece2bd',
  cemetery: '#d7dcc4',
  industrial: '#e3dccd',
  pedestrian: '#efe4cc',
  building: '#e7d8bc',
  buildingLine: '#cdb994',
  road: '#fffaf0',
  roadCase: '#cdb994',
  major: '#fbeccb',
  path: '#a98e66',
  rail: '#a8998a',
  label: '#4a3b2d',
  waterLabel: '#2f6f97',
  halo: '#f8f1e2',
  district: '#8a5a2b',
  route: '#b8322a',
  routeDraft: '#9a7b5a',
  wildInk: '#4d8a3f',
  rippleInk: '#2d78ad',
  accuracy: '#2b6a94',
  locked: '#3b2f25',
};

export const NIGHT: Palette = {
  background: '#1a2131',
  earth: '#1a2131',
  water: '#1f4a6e',
  waterLine: '#2d6390',
  park: '#25402f',
  forest: '#203a2b',
  grass: '#283f30',
  farmland: '#2b3040',
  cemetery: '#262f37',
  industrial: '#252a38',
  pedestrian: '#262d40',
  building: '#2a3145',
  buildingLine: '#3a4360',
  road: '#3a4462',
  roadCase: '#151b29',
  major: '#4a5577',
  path: '#7d86a6',
  rail: '#5d6684',
  label: '#e9e1cf',
  waterLabel: '#9ccbee',
  halo: '#1a2131',
  district: '#e0b36a',
  route: '#ff8a7a',
  routeDraft: '#8d97b5',
  wildInk: '#86c879',
  rippleInk: '#86c2ee',
  accuracy: '#85bde4',
  locked: '#05070c',
};

const kind = (...kinds: string[]) =>
  ['in', ['get', 'kind'], ['literal', kinds]] as unknown as boolean;

/** Paint values that follow the palette: [layer id, paint property, value]. */
export function paletteProps(p: Palette): [string, string, unknown][] {
  return [
    ['background', 'background-color', p.background],
    ['earth', 'fill-color', p.earth],
    [
      'landcover',
      'fill-color',
      [
        'match',
        ['get', 'kind'],
        'forest',
        p.forest,
        'grassland',
        p.grass,
        'farmland',
        p.farmland,
        p.earth,
      ],
    ],
    [
      'landuse',
      'fill-color',
      [
        'match',
        ['get', 'kind'],
        [
          'park',
          'garden',
          'playground',
          'golf_course',
          'zoo',
          'recreation_ground',
          'village_green',
          'allotments',
        ],
        p.park,
        ['forest', 'wood', 'nature_reserve'],
        p.forest,
        ['grass', 'meadow', 'grassland', 'scrub', 'heath'],
        p.grass,
        ['farmland', 'orchard', 'farmyard'],
        p.farmland,
        ['cemetery', 'grave_yard'],
        p.cemetery,
        ['industrial', 'railway', 'port', 'military'],
        p.industrial,
        ['pedestrian', 'platform'],
        p.pedestrian,
        'rgba(0,0,0,0)',
      ],
    ],
    ['water', 'fill-color', p.water],
    ['waterway', 'line-color', p.waterLine],
    ['buildings', 'fill-color', p.building],
    ['buildings', 'fill-outline-color', p.buildingLine],
    ['rail', 'line-color', p.rail],
    ['roads-case', 'line-color', p.roadCase],
    ['paths', 'line-color', p.path],
    ['roads', 'line-color', ['match', ['get', 'kind'], ['highway', 'major_road'], p.major, p.road]],
    ['water-labels', 'text-color', p.waterLabel],
    ['water-labels', 'text-halo-color', p.halo],
    ['road-labels', 'text-color', p.label],
    ['road-labels', 'text-halo-color', p.halo],
    ['place-labels', 'text-color', p.label],
    ['place-labels', 'text-halo-color', p.halo],
    // game layers (added by map/layers.ts; skipped while missing)
    ['districts', 'line-color', p.district],
    ['district-labels', 'text-color', p.district],
    ['district-labels', 'text-halo-color', p.halo],
    ['locked-districts', 'fill-color', p.locked],
    ['routes', 'line-color', ['case', ['get', 'draft'], p.routeDraft, p.route]],
    ['route-labels', 'text-color', ['case', ['get', 'draft'], p.routeDraft, p.route]],
    ['route-labels', 'text-halo-color', p.halo],
    ['player-accuracy', 'fill-color', p.accuracy],
    ['player-accuracy-line', 'line-color', p.accuracy],
  ];
}

/** Switches a loaded map between palettes without rebuilding it. */
export function applyPalette(map: MlMap, p: Palette): void {
  for (const [id, prop, value] of paletteProps(p)) {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, value as never);
  }
}

/** Builds the style; `base` is the app's base URL (handles the GitHub Pages sub-path). */
export function paperStyle(base: string, tilesUrl: string, p: Palette = PAPER): StyleSpecification {
  const name = ['coalesce', ['get', 'name:da'], ['get', 'name']];
  const paint = Object.fromEntries(
    paletteProps(p).map(([id, prop, v]) => [`${id}|${prop}`, v]),
  ) as Record<string, never>;
  const pp = (id: string, ...props: string[]) =>
    Object.fromEntries(props.map((prop) => [prop, paint[`${id}|${prop}`]]));
  return {
    version: 8,
    glyphs: `${base}fonts/{fontstack}/{range}.pbf`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${tilesUrl}`,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: pp('background', 'background-color') },
      {
        id: 'earth',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'earth',
        paint: pp('earth', 'fill-color'),
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landcover',
        paint: pp('landcover', 'fill-color'),
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landuse',
        paint: pp('landuse', 'fill-color'),
      },
      {
        id: 'water',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: pp('water', 'fill-color'),
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          ...pp('waterway', 'line-color'),
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 4, 18, 8],
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'buildings',
        minzoom: 14,
        paint: pp('buildings', 'fill-color', 'fill-outline-color'),
      },
      {
        id: 'rail',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: kind('rail'),
        paint: { ...pp('rail', 'line-color'), 'line-width': 1.5, 'line-dasharray': [3, 2] },
      },
      {
        id: 'roads-case',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: kind('highway', 'major_road', 'minor_road'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          ...pp('roads-case', 'line-color'),
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1.5, 16, 9, 19, 28],
        },
      },
      {
        id: 'paths',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: kind('path'),
        minzoom: 14,
        paint: {
          ...pp('paths', 'line-color'),
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 2.5],
          'line-dasharray': [2, 1.5],
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: kind('highway', 'major_road', 'minor_road'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          ...pp('roads', 'line-color'),
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.8, 16, 7, 19, 24],
        },
      },
      {
        id: 'water-labels',
        type: 'symbol',
        source: 'protomaps',
        'source-layer': 'water',
        minzoom: 14,
        layout: {
          'text-field': name as never,
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'symbol-placement': 'point',
        },
        paint: { ...pp('water-labels', 'text-color', 'text-halo-color'), 'text-halo-width': 1.5 },
      },
      {
        id: 'road-labels',
        type: 'symbol',
        source: 'protomaps',
        'source-layer': 'roads',
        minzoom: 15,
        filter: kind('major_road', 'minor_road'),
        layout: {
          'text-field': name as never,
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'symbol-placement': 'line',
        },
        paint: { ...pp('road-labels', 'text-color', 'text-halo-color'), 'text-halo-width': 1.5 },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'protomaps',
        'source-layer': 'places',
        layout: {
          'text-field': name as never,
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 16, 15],
        },
        paint: { ...pp('place-labels', 'text-color', 'text-halo-color'), 'text-halo-width': 2 },
      },
    ],
  };
}
