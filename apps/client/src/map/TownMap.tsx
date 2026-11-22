import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl';
import { badgeUrl, stampUrl } from '@oml/art';
import { content } from '@oml/data';
import { distanceM, isDistrictUnlocked, type LatLng, type SaveGame } from '@oml/game';
import type { Region } from '@oml/spawn';
import type { Translate } from '../i18n';
import { formatM } from '../game/goalText';
import { Button } from '../ui/components';
import { addWorldLayers, setDistrictLabels, setLockedDistricts, setWild } from './layers';
import { markerElement, PLAYER_SVG, STAR_SVG, START, addAttribution } from './markers';
import { paperStyle, type Palette } from './style';

/**
 * Town Map (M2d, GDD "Town Map"): a flat overview of Odense in the paper style. Districts
 * (locked ones dimmed), arenas with badge state, routes, rest stops, the player and the
 * Journal's target. Tapping a place shows its name, straight-line distance, district and
 * what it needs. No turn-by-turn directions.
 */
type Selected =
  { kind: 'arena'; arena: number } | { kind: 'route'; id: string } | { kind: 'rest'; id: string };

const TOWN = { minZoom: 12, maxZoom: 16, zoom: 13.6 };

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
  const [selected, setSelected] = useState<Selected | null>(null);

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
      maxBounds: [
        [10.25, 55.32],
        [10.52, 55.46],
      ],
      attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();
    addAttribution(map, new maplibregl.AttributionControl({ compact: true }));
    const added: Marker[] = [];
    const add = (el: HTMLElement, p: LatLng, anchor: 'center' | 'bottom' = 'center') =>
      added.push(
        new maplibregl.Marker({ element: el, anchor }).setLngLat([p.lng, p.lat]).addTo(map),
      );

    map.on('load', () => {
      addWorldLayers(map, palette, {
        mode: 'town',
        districtName: (id) => t(`district.${id}.name`),
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
      const el = markerElement(
        'button',
        `tm-marker small route${r.draft ? ' draft' : ''}`,
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
    setDistrictLabels(map, (id) =>
      isDistrictUnlocked(save.badges, id)
        ? t(`district.${id}.name`)
        : `${t(`district.${id}.name`)}
${t('journal.locked', { badge: t(`badge.${id - 1}.name`) })}`,
    );
    setLockedDistricts(
      map,
      [1, 2, 3, 4, 5, 6, 7, 8].filter((d) => !isDistrictUnlocked(save.badges, d)),
    );
  }, [ready, region, save.badges, t]);

  const card = (() => {
    if (!selected) return null;
    const away = (p: LatLng) =>
      position ? t('townMap.straight', { d: formatM(distanceM(position, p)) }) : '—';
    let title: string;
    let icon: string;
    let district: number;
    let distance: string;
    let needs: string;
    if (selected.kind === 'arena') {
      const site = content.arenaSites[selected.arena - 1]!;
      title = t('townMap.arenaLabel', { place: t(`arenaSite.${site.arena}.name`) });
      icon = badgeUrl(site.arena);
      district = site.district;
      distance = away(site);
      needs = save.badges.includes(site.arena)
        ? t('townMap.badgeEarned', { badge: t(`badge.${site.arena}.name`) })
        : !isDistrictUnlocked(save.badges, site.district)
          ? t('townMap.needsBadge', { badge: t(`badge.${site.district - 1}.name`) })
          : !site.poi
            ? t('townMap.later')
            : t('townMap.arenaOpen');
    } else if (selected.kind === 'route') {
      const r = content.routes[selected.id]!;
      title = t(`route.${r.id}.name`);
      icon = '';
      district = r.to;
      distance = away(midpoint(r.path));
      needs = r.draft
        ? t('townMap.draftRoute')
        : !isDistrictUnlocked(save.badges, r.to)
          ? t('townMap.needsBadge', { badge: t(`badge.${r.from}.name`) })
          : t('townMap.routeOpen', {
              m: formatM(r.lengthM),
              pct: Math.round(r.wildShare * 100),
            });
    } else {
      const poi = content.pois[selected.id]!;
      title = t(`poi.${poi.id}.name`);
      icon = stampUrl('restStop');
      district = poi.district;
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
              <dt>{t('townMap.district')}</dt>
              <dd>{t(`district.${district}.name`)}</dd>
              <dt>{t('townMap.needs')}</dt>
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
    <section className="town-map" data-testid="town-map" aria-label={t('townMap.title')}>
      <div ref={ref} className="map" />
      <header className="town-map-head">
        <h1>{t('townMap.title')}</h1>
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
    </section>
  );
}
