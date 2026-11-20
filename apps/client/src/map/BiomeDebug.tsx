import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { BIOMES, type Biome } from '@oml/data';
import districtsRaw from '@oml/data/content/districts.odense.geojson?raw';

const districtsGeo = JSON.parse(districtsRaw) as GeoJSON.FeatureCollection;
import { cellToBoundary } from 'h3-js';
import type { Translate } from '../i18n';
import { paperStyle, PAPER } from './style';

/** Debug colours per biome (strong, so mistakes are easy to spot against reality). */
export const BIOME_COLORS: Record<Biome, string> = {
  water: '#1d7fd0',
  forest: '#1f7a3a',
  park: '#5fbf4a',
  meadow: '#c6d96b',
  farmland: '#e3b04b',
  urban: '#a08b78',
  industrial: '#6b6b7b',
  historic: '#b04ab0',
};

let protocolAdded = false;

/** Optional view in the hash: #/dev/biomes?lat=55.39&lng=10.38&z=16 */
export function viewFromHash(hash: string): { center: [number, number]; zoom: number } {
  const q = new URLSearchParams(hash.split('?')[1] ?? '');
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  const z = Number(q.get('z'));
  return {
    center: [
      Number.isFinite(lng) && lng !== 0 ? lng : 10.386,
      Number.isFinite(lat) && lat !== 0 ? lat : 55.396,
    ],
    zoom: Number.isFinite(z) && z > 0 ? z : 14.2,
  };
}

/** Dev-only view (#/dev/biomes): region cells coloured by dominant biome, noSpawn and districts. */
export function BiomeDebug({ t }: { t: Translate }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    if (!protocolAdded) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolAdded = true;
    }
    const base = new URL(import.meta.env.BASE_URL, window.location.href).href;
    const map = new maplibregl.Map({
      container: ref.current,
      style: paperStyle(base, `${base}tiles/odense.pmtiles`),
      ...viewFromHash(window.location.hash),
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left');
    let alive = true;
    map.on('load', async () => {
      // Loaded lazily: the region file is only needed by this dev view.
      const region = (await import('@oml/data/region/odense.json')).default as unknown as {
        cells: Record<string, number[]>;
      };
      if (!alive) return;
      const features: GeoJSON.Feature[] = [];
      for (const [id, row] of Object.entries(region.cells)) {
        const shares = row.slice(2);
        let best = 0;
        for (let i = 1; i < shares.length; i++) if (shares[i]! > shares[best]!) best = i;
        const ring = cellToBoundary(id, true);
        features.push({
          type: 'Feature',
          properties: {
            id,
            district: row[0],
            noSpawn: row[1],
            biome: BIOMES[best],
            share: shares[best],
            shares: BIOMES.map((b, i) => `${b} ${shares[i]}%`)
              .filter((s) => !s.endsWith(' 0%'))
              .join(', '),
          },
          geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
        });
      }
      setCount(features.length);
      map.addSource('cells', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer(
        {
          id: 'cells',
          type: 'fill',
          source: 'cells',
          paint: {
            'fill-color': [
              'match',
              ['get', 'biome'],
              ...BIOMES.flatMap((b) => [b, BIOME_COLORS[b]]),
              '#999',
            ] as never,
            'fill-opacity': ['interpolate', ['linear'], ['get', 'share'], 0, 0.15, 100, 0.55],
          },
        },
        'place-labels',
      );
      map.addLayer({
        id: 'nospawn',
        type: 'line',
        source: 'cells',
        filter: ['==', ['get', 'noSpawn'], 1],
        paint: { 'line-color': '#d11', 'line-width': 1.6 },
      });
      map.addSource('districts', { type: 'geojson', data: districtsGeo });
      map.addLayer({
        id: 'districts',
        type: 'line',
        source: 'districts',
        paint: { 'line-color': PAPER.district, 'line-width': 3, 'line-dasharray': [3, 2] },
      });
      map.on('click', 'cells', (e) => {
        const p = e.features?.[0]?.properties as Record<string, string | number> | undefined;
        if (p) setInfo(`${p.id} · d${p.district}${p.noSpawn ? ' · noSpawn' : ''} · ${p.shares}`);
      });
    });
    return () => {
      alive = false;
      map.remove();
    };
  }, []);

  return (
    <main className="map-screen">
      <div ref={ref} className="map" />
      <div className="debug-legend">
        <strong>{t('debug.biomes.title')}</strong> <span className="muted small">({count})</span>
        <div className="muted small">{t('debug.biomes.hint')}</div>
        <ul>
          {BIOMES.map((b) => (
            <li key={b}>
              <span className="swatch" style={{ background: BIOME_COLORS[b] }} />
              {t(`biome.${b}.name`)}
            </li>
          ))}
          <li>
            <span className="swatch nospawn" />
            {t('debug.noSpawn')}
          </li>
        </ul>
        {info && <div className="debug-info">{info}</div>}
      </div>
    </main>
  );
}
