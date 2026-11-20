import type { StyleSpecification } from 'maplibre-gl';

/**
 * "Paper" map style for the Protomaps basemap (schema v4). Calm cream tones; water, parks
 * and forest stand out clearly because they decide which creatures spawn (GDD "Art").
 */
export const PAPER = {
  background: '#f3ead6',
  earth: '#f3ead6',
  water: '#7fbde4',
  waterLine: '#5aa6d6',
  park: '#b9da9c',
  forest: '#93bf7f',
  grass: '#cfe3b2',
  farmland: '#ece2bd',
  cemetery: '#d7dcc4',
  industrial: '#e3dccd',
  pedestrian: '#efe6d2',
  building: '#e6d9c1',
  buildingLine: '#d2c1a2',
  road: '#fffaf0',
  roadCase: '#cdb994',
  major: '#fdf3d8',
  rail: '#a8998a',
  label: '#4a3b2d',
  halo: '#f8f1e2',
  district: '#8a5a2b',
};

/** Builds the style; `base` is the app's base URL (handles the GitHub Pages sub-path). */
export function paperStyle(base: string, tilesUrl: string): StyleSpecification {
  const kind = (...kinds: string[]) =>
    ['in', ['get', 'kind'], ['literal', kinds]] as unknown as boolean;
  const name = ['coalesce', ['get', 'name:da'], ['get', 'name']];
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
      { id: 'background', type: 'background', paint: { 'background-color': PAPER.background } },
      {
        id: 'earth',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'earth',
        paint: { 'fill-color': PAPER.earth },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match',
            ['get', 'kind'],
            'forest',
            PAPER.forest,
            'grassland',
            PAPER.grass,
            'farmland',
            PAPER.farmland,
            PAPER.earth,
          ],
        },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landuse',
        paint: {
          'fill-color': [
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
            PAPER.park,
            ['forest', 'wood', 'nature_reserve'],
            PAPER.forest,
            ['grass', 'meadow', 'grassland', 'scrub', 'heath'],
            PAPER.grass,
            ['farmland', 'orchard', 'farmyard'],
            PAPER.farmland,
            ['cemetery', 'grave_yard'],
            PAPER.cemetery,
            ['industrial', 'railway', 'port', 'military'],
            PAPER.industrial,
            ['pedestrian', 'platform'],
            PAPER.pedestrian,
            'rgba(0,0,0,0)',
          ],
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': PAPER.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': PAPER.waterLine,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 4, 18, 8],
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'buildings',
        minzoom: 14,
        paint: { 'fill-color': PAPER.building, 'fill-outline-color': PAPER.buildingLine },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: kind('rail'),
        paint: { 'line-color': PAPER.rail, 'line-width': 1.5, 'line-dasharray': [3, 2] },
      },
      {
        id: 'roads-case',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: kind('highway', 'major_road', 'minor_road'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PAPER.roadCase,
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
          'line-color': '#b39a74',
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
          'line-color': [
            'match',
            ['get', 'kind'],
            ['highway', 'major_road'],
            PAPER.major,
            PAPER.road,
          ],
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
        paint: { 'text-color': '#2f6f97', 'text-halo-color': PAPER.halo, 'text-halo-width': 1.5 },
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
        paint: { 'text-color': PAPER.label, 'text-halo-color': PAPER.halo, 'text-halo-width': 1.5 },
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
        paint: { 'text-color': PAPER.label, 'text-halo-color': PAPER.halo, 'text-halo-width': 2 },
      },
    ],
  };
}
