import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { badgeUrl } from '@oml/art';
import {
  PLAYABLE_MUNICIPALITIES,
  REGION_IDS,
  regions,
  type MunicipalityId,
  type RegionId,
} from '@oml/data';
import fynRaw from '@oml/data/content/shared/fyn.geojson?raw';
import type { SaveGame } from '@oml/game';
import type { Translate } from '../i18n';
import { Button } from '../ui/components';
import { glyphSafe } from './layers';
import type { Palette } from './style';

/**
 * Fyn map (P22, owner request): the regions of Fyn, one per municipality, for choosing a
 * region. A playable region opens its Town Map (the one being played, or another one to look
 * at before travelling there: owner request); the others say "coming later". It shows each region's
 * arena badges (grey until won) and nothing else, in the Town Map's paper style. The view is
 * held on Fyn (no panning out to the rest of Denmark) and zoom is kept to a narrow range.
 */
const fyn = JSON.parse(fynRaw) as GeoJSON.FeatureCollection<
  GeoJSON.MultiPolygon,
  { id: MunicipalityId }
>;

/** Fyn and its islands: what the map fits on opening. */
export const FYN_BOUNDS: [[number, number], [number, number]] = [
  [9.6, 54.7],
  [11.0, 55.68],
];
/**
 * How far the view may go: Fyn plus open sea above and below. A phone held upright is taller
 * than Fyn is wide; with tight bounds MapLibre zooms in until the screen fits inside them and
 * cuts off Middelfart and Nyborg.
 */
export const FYN_MAX_BOUNDS: [[number, number], [number, number]] = [
  [9.35, 53.9],
  [11.25, 56.5],
];

/** Where each region's name sits (roughly the middle of the land). */
const LABEL_AT: Record<MunicipalityId, [number, number]> = {
  odense: [10.39, 55.4],
  middelfart: [9.88, 55.46],
  nordfyns: [10.2, 55.53],
  kerteminde: [10.64, 55.45],
  assens: [9.99, 55.27],
  nyborg: [10.74, 55.28],
  faaborg_midtfyn: [10.33, 55.15],
  svendborg: [10.6, 55.07],
  aeroe: [10.38, 54.87],
  langeland: [10.78, 54.93],
};

function appBase(): string {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

const playable = (id: string) => (PLAYABLE_MUNICIPALITIES as readonly string[]).includes(id);

/**
 * A light sketch of each playable region (owner: the solid green hid the badges): its game
 * routes as faint lines, walked or sailed, nothing else.
 */
const routeSketch: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: REGION_IDS.filter(playable).flatMap((r) =>
    Object.values(regions[r].routes).map((route) => ({
      type: 'Feature' as const,
      properties: { ferry: route.kind === 'ferry' },
      geometry: { type: 'LineString' as const, coordinates: route.path },
    })),
  ),
};

function fynStyle(
  base: string,
  p: Palette,
  name: (id: MunicipalityId) => string,
): StyleSpecification {
  return {
    version: 8,
    glyphs: `${base}fonts/{fontstack}/{range}.pbf`,
    sources: {
      fyn: { type: 'geojson', data: fyn },
      sketch: { type: 'geojson', data: routeSketch },
      labels: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: fyn.features.map((f) => ({
            type: 'Feature',
            properties: { id: f.properties.id, name: glyphSafe(name(f.properties.id)) },
            geometry: { type: 'Point', coordinates: LABEL_AT[f.properties.id] },
          })),
        },
      },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': p.water } },
      {
        id: 'land',
        type: 'fill',
        source: 'fyn',
        paint: { 'fill-color': p.earth },
      },
      {
        id: 'playable-tint',
        type: 'fill',
        source: 'fyn',
        filter: ['in', ['get', 'id'], ['literal', PLAYABLE_MUNICIPALITIES]],
        paint: { 'fill-color': p.park, 'fill-opacity': 0.28 },
      },
      {
        id: 'sketch',
        type: 'line',
        source: 'sketch',
        filter: ['!', ['get', 'ferry']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.route,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 10, 1.4],
          'line-opacity': 0.5,
        },
      },
      {
        id: 'sketch-ferry',
        type: 'line',
        source: 'sketch',
        filter: ['get', 'ferry'],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': p.route,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 10, 1.4],
          'line-opacity': 0.4,
          'line-dasharray': [1, 3],
        },
      },
      {
        id: 'later',
        type: 'fill',
        source: 'fyn',
        filter: ['!', ['in', ['get', 'id'], ['literal', PLAYABLE_MUNICIPALITIES]]],
        paint: { 'fill-color': p.locked, 'fill-opacity': 0.14 },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'fyn',
        paint: { 'line-color': p.district, 'line-width': 1.5, 'line-dasharray': [3, 2] },
      },
      {
        id: 'playable-border',
        type: 'line',
        source: 'fyn',
        filter: ['in', ['get', 'id'], ['literal', PLAYABLE_MUNICIPALITIES]],
        paint: { 'line-color': p.route, 'line-width': 3 },
      },
      {
        id: 'names',
        type: 'symbol',
        source: 'labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Medium'],
          'text-size': [
            'case',
            ['in', ['get', 'id'], ['literal', PLAYABLE_MUNICIPALITIES]],
            16,
            13,
          ],
          'text-max-width': 9,
          'text-anchor': [
            'case',
            ['in', ['get', 'id'], ['literal', PLAYABLE_MUNICIPALITIES]],
            'bottom',
            'center',
          ],
          'text-offset': [
            'case',
            ['in', ['get', 'id'], ['literal', PLAYABLE_MUNICIPALITIES]],
            ['literal', [0, -1.4]],
            ['literal', [0, 0]],
          ],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 2 },
      },
    ],
  };
}

export function FynMap({
  t,
  save,
  viewing,
  palette,
  onClose,
  onOpen,
}: {
  t: Translate;
  save: SaveGame;
  /** The region whose Town Map is open under the Fyn map. */
  viewing: MunicipalityId;
  palette: Palette;
  onClose: () => void;
  /** Opens a playable region's Town Map (to look at it; play needs walking there). */
  onOpen: (region: RegionId) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [later, setLater] = useState<MunicipalityId | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!ref.current) return;
    const name = (id: MunicipalityId) =>
      playable(id)
        ? t(`municipality.${id}.name`)
        : `${t(`municipality.${id}.name`)}\n${t('fynMap.later')}`;
    const map: MlMap = new maplibregl.Map({
      container: ref.current,
      style: fynStyle(appBase(), palette, name),
      bounds: FYN_BOUNDS,
      fitBoundsOptions: { padding: 12 },
      maxBounds: FYN_MAX_BOUNDS,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '© OpenStreetMap contributors',
      }),
    );
    // Zoom: from the whole of Fyn in to about one region, no further.
    map.once('load', () => {
      const z = map.getZoom();
      map.setMinZoom(z);
      map.setMaxZoom(z + 1.6);
    });
    const open = (id: string) => {
      setLater(null);
      if (id === viewing) onCloseRef.current();
      else if (playable(id)) onOpenRef.current(id as RegionId);
      else setLater(id as MunicipalityId);
    };
    map.on('click', 'land', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) open(id);
    });
    map.on('mouseenter', 'land', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'land', () => (map.getCanvas().style.cursor = ''));

    // Each playable region's badges, under its name (grey until won).
    const markers: maplibregl.Marker[] = [];
    const badgesOf = (id: string) =>
      id === save.region
        ? save.badges
        : ((save.campaigns as Record<string, { badges: number[] } | undefined>)[id]?.badges ?? []);
    for (const id of PLAYABLE_MUNICIPALITIES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'fyn-badges';
      el.dataset.testid = `fyn-badges-${id}`;
      el.setAttribute('aria-label', t('fynMap.open', { region: t(`municipality.${id}.name`) }));
      for (let n = 1; n <= 8; n++) {
        const img = document.createElement('img');
        img.src = badgeUrl(n, true, id as typeof save.region);
        img.alt = '';
        if (!badgesOf(id).includes(n)) img.className = 'locked';
        el.appendChild(img);
      }
      el.addEventListener('click', () => open(id));
      markers.push(
        new maplibregl.Marker({ element: el, anchor: 'top' }).setLngLat(LABEL_AT[id]).addTo(map),
      );
    }
    (window as unknown as { __omlFynMap?: MlMap }).__omlFynMap = map;
    return () => {
      for (const m of markers) m.remove();
      map.remove();
      delete (window as unknown as { __omlFynMap?: MlMap }).__omlFynMap;
    };
    // Built once when the Fyn map opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="town-map fyn-map" data-testid="fyn-map" aria-label={t('fynMap.title')}>
      <div ref={ref} className="map" />
      <header className="town-map-head">
        <h1>{t('fynMap.title')}</h1>
        <Button
          round
          variant="ghost"
          icon="close"
          data-testid="fynmap-close"
          aria-label={t('fynMap.close')}
          onClick={onClose}
        />
      </header>
      <p className="fyn-hint" data-testid="fyn-hint">
        {t('fynMap.hint')}
      </p>
      {later && (
        <div className="town-map-card" data-testid="fynmap-card">
          <div className="poi-card">
            <div>
              <strong>{t(`municipality.${later}.name`)}</strong>
              <p className="small">{t('fynMap.laterCard')}</p>
            </div>
            <Button
              round
              variant="ghost"
              icon="close"
              aria-label={t('fynMap.close')}
              onClick={() => setLater(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
