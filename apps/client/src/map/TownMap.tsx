import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl';
import { badgeUrl, stampUrl } from '@oml/art';
import { content } from '@oml/data';
import {
  arenaReady,
  distanceM,
  isZoneOpen,
  routeProgress,
  type LatLng,
  type SaveGame,
} from '@oml/game';
import type { Region } from '@oml/spawn';
import type { Translate } from '../i18n';
import { formatM, routePercent } from '../game/goalText';
import { useBackHandler } from '../ui/backStack';
import { Button } from '../ui/components';
import { FynMap } from './FynMap';
import { addWorldLayers, setLockedZones, setRouteProgress, setWild, setZoneLabels } from './layers';
import { markerElement, PLAYER_SVG, STAR_SVG, START, addAttribution } from './markers';
import { paperStyle, type Palette } from './style';

/**
 * Town Map (M2d, GDD "Town Map", P22): a flat overview of the region in the paper style.
 * Zones (locked ones dimmed), arenas with badge state, routes with their walked part and
 * number, rest stops, the player and the Journal's target. Tapping a place shows its name,
 * straight-line distance and what it needs. No turn-by-turn directions. The Fyn button opens
 * the overview of all regions on Fyn (FynMap); back closes that first.
 */
type Selected =
  { kind: 'arena'; arena: number } | { kind: 'route'; id: string } | { kind: 'rest'; id: string };

/**
 * Odense Kommune with a margin: the map can't be dragged out of the region. Extra room above
 * and below, so a phone held upright can zoom out to the whole municipality.
 */
export const REGION_BOUNDS: [[number, number], [number, number]] = [
  [10.12, 55.18],
  [10.64, 55.59],
];
const TOWN = { minZoom: 10.3, maxZoom: 16, zoom: 13 };
/** Below this zoom only arenas show (route numbers and rest stops would crowd the map). */
const FAR_ZOOM = 11.8;

function appBase(): string {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

/** Midpoint of a path by length (where the route's number tag sits). */
function midpoint(path: [number, number][]): LatLng {
  const pts = path.map(([lng, lat]) => ({ lat, lng }));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distanceM(pts[i - 1]!, pts[i]!);
  let half = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = distanceM(pts[i - 1]!, pts[i]!);
    if (half <= d) {
      const f = half / d;
      return {
        lat: pts[i - 1]!.lat + (pts[i]!.lat - pts[i - 1]!.lat) * f,
        lng: pts[i - 1]!.lng + (pts[i]!.lng - pts[i - 1]!.lng) * f,
      };
    }
    half -= d;
  }
  return pts[0]!;
}

export function TownMap({
  t,
  save,
  position,
  region,
  target,
  palette,
  onClose,
}: {
  t: Translate;
  save: SaveGame;
  position: LatLng | null;
  region: Region | null;
  target: LatLng | null;
  palette: Palette;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [far, setFar] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [fyn, setFyn] = useState(false);
  useBackHandler(fyn, () => setFyn(false));

  useEffect(() => {
    if (!ref.current) return;
    const base = appBase();
    const centre = position ?? START;
    const map = new maplibregl.Map({
      container: ref.current,
      style: paperStyle(base, `${base}tiles/odense.pmtiles`, palette),
      center: [centre.lng, centre.lat],
      zoom: TOWN.zoom,
      minZoom: TOWN.minZoom,
      maxZoom: TOWN.maxZoom,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxBounds: REGION_BOUNDS,
      attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();
    addAttribution(map, new maplibregl.AttributionControl({ compact: true }));
    const added: Marker[] = [];
    const add = (el: HTMLElement, p: LatLng, anchor: 'center' | 'bottom' = 'center') =>
      added.push(
        new maplibregl.Marker({ element: el, anchor }).setLngLat([p.lng, p.lat]).addTo(map),
      );

    const onZoom = () => setFar(map.getZoom() < FAR_ZOOM);
    map.on('zoom', onZoom);
    onZoom();
    map.on('load', () => {
      addWorldLayers(map, palette, {
        mode: 'town',
        districtName: (id) => t(`district.${id}.name`),
        zoneName: (id) => t(`zone.${id}.name`),
        routeName: (id) => t(`route.${id}.name`),
      });
      setReady(true);
    });
    for (const site of content.arenaSites) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = badgeUrl(site.arena);
      const won = save.badges.includes(site.arena);
      const el = markerElement('button', `tm-marker${won ? '' : ' locked'}`, img);
      el.dataset.testid = `tm-arena-${site.arena}`;
      el.setAttribute(
        'aria-label',
        t('townMap.arenaLabel', { place: t(`arenaSite.${site.arena}.name`) }),
      );
      el.addEventListener('click', () => setSelected({ kind: 'arena', arena: site.arena }));
      add(el, site);
    }
    for (const poi of Object.values(content.pois)) {
      if (poi.kind !== 'restStop') continue;
      const img = document.createElement('img');
      img.alt = '';
      img.src = stampUrl('restStop');
      const el = markerElement('button', 'tm-marker small', img);
      el.dataset.testid = `tm-rest-${poi.id}`;
      el.setAttribute('aria-label', t(`poi.${poi.id}.name`));
      el.addEventListener('click', () => setSelected({ kind: 'rest', id: poi.id }));
      add(el, poi);
    }
    for (const r of Object.values(content.routes)) {
      const p = routeProgress(save, r);
      const el = markerElement(
        'button',
        `tm-marker small route ${r.kind}${p.done ? ' done' : ''}`,
        `<span class="tm-body">${r.number}</span>`,
      );
      el.dataset.testid = `tm-route-${r.id}`;
      el.setAttribute('aria-label', t(`route.${r.id}.name`));
      el.addEventListener('click', () => setSelected({ kind: 'route', id: r.id }));
      add(el, midpoint(r.path));
    }
    if (target) {
      const el = document.createElement('div');
      el.className = 'target-marker';
      el.dataset.testid = 'tm-target';
      el.innerHTML = `<div class="target-body">${STAR_SVG}</div>`;
      add(el, target, 'bottom');
    }
    if (position) {
      const el = markerElement('div', 'player-marker', PLAYER_SVG);
      el.dataset.testid = 'tm-player';
      add(el, position, 'bottom');
    }
    mapRef.current = map;
    (window as unknown as { __omlTownMap?: MlMap }).__omlTownMap = map;
    return () => {
      for (const m of added) m.remove();
      map.remove();
      mapRef.current = null;
      delete (window as unknown as { __omlTownMap?: MlMap }).__omlTownMap;
    };
    // The Town Map is rebuilt each time it opens; it doesn't follow live changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setWild(map, region);
    setZoneLabels(map, (id) =>
      isZoneOpen(save, id)
        ? t(`zone.${id}.name`)
        : `${t(`zone.${id}.name`)}\n${t('townMap.zoneLocked')}`,
    );
    setLockedZones(
      map,
      Object.keys(content.zones).filter((z) => !isZoneOpen(save, z)),
    );
    setRouteProgress(map, save);
  }, [ready, region, save, t]);

  const card = (() => {
    if (!selected) return null;
    const away = (p: LatLng) =>
      position ? t('townMap.straight', { d: formatM(distanceM(position, p)) }) : '—';
    let title: string;
    let icon: string;
    let zone: string;
    let distance: string;
    let needs: string;
    let needsLabel = t('townMap.needs');
    if (selected.kind === 'arena') {
      const site = content.arenaSites[selected.arena - 1]!;
      title = t('townMap.arenaLabel', { place: t(`arenaSite.${site.arena}.name`) });
      icon = badgeUrl(site.arena);
      zone = site.zone;
      distance = away(site);
      needs = save.badges.includes(site.arena)
        ? t('townMap.badgeEarned', { badge: t(`badge.${site.arena}.name`) })
        : !isZoneOpen(save, site.zone)
          ? t('townMap.needsZone', { zone: t(`zone.${site.zone}.name`) })
          : !arenaReady(save, site.arena)
            ? t('townMap.needsBadge', { badge: t(`badge.${site.arena - 1}.name`) })
            : !site.poi
              ? t('townMap.later')
              : t('townMap.arenaOpen');
    } else if (selected.kind === 'route') {
      const r = content.routes[selected.id]!;
      const p = routeProgress(save, r);
      title = t(`route.${r.id}.name`);
      icon = '';
      zone = isZoneOpen(save, r.from) ? r.to : r.from;
      distance = away(midpoint(r.path));
      needsLabel = t('townMap.progress');
      needs = p.done
        ? t('townMap.routeDone', { m: formatM(r.lengthM) })
        : t('townMap.routeProgress', {
            pct: routePercent(p.n, p.of),
            m: formatM(r.lengthM),
            wild: Math.round(r.wildShare * 100),
          });
    } else {
      const poi = content.pois[selected.id]!;
      title = t(`poi.${poi.id}.name`);
      icon = stampUrl('restStop');
      zone = poi.zone;
      distance = away(poi);
      needs = t('townMap.restOpen');
    }
    return (
      <div className="town-map-card" data-testid="townmap-card">
        <div className="poi-card">
          {icon && <img src={icon} alt="" className="poi-card-stamp" />}
          <div>
            <strong>{title}</strong>
            <dl>
              <dt>{t('townMap.distance')}</dt>
              <dd data-testid="townmap-distance">{distance}</dd>
              <dt>{selected.kind === 'route' ? t('townMap.leadsTo') : t('townMap.zone')}</dt>
              <dd>
                {t(`zone.${zone}.name`)}
                {!isZoneOpen(save, zone) && ` · ${t('townMap.zoneLocked')}`}
              </dd>
              <dt>{needsLabel}</dt>
              <dd data-testid="townmap-needs">{needs}</dd>
            </dl>
          </div>
          <Button
            round
            variant="ghost"
            icon="close"
            aria-label={t('townMap.close')}
            onClick={() => setSelected(null)}
          />
        </div>
      </div>
    );
  })();

  return (
    <section
      className={`town-map${far ? ' far' : ''}`}
      data-testid="town-map"
      aria-label={t('townMap.title')}
    >
      <div ref={ref} className="map" />
      <header className="town-map-head">
        <h1>{t('townMap.title')}</h1>
        <Button
          variant="ghost"
          icon="map"
          data-testid="townmap-fyn"
          onClick={() => {
            setSelected(null);
            setFyn(true);
          }}
        >
          {t('townMap.fyn')}
        </Button>
        <Button
          round
          variant="ghost"
          icon="close"
          data-testid="townmap-close"
          aria-label={t('townMap.close')}
          onClick={onClose}
        />
      </header>
      {card}
      {fyn && <FynMap t={t} save={save} palette={palette} onClose={() => setFyn(false)} />}
    </section>
  );
}
