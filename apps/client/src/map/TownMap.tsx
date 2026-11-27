import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl';
import { stampUrl } from '@oml/art';
import { MAP_FRAMES, regions, type RegionId } from '@oml/data';
import {
  arenaReady,
  challengeTier,
  distanceM,
  isZoneOpen,
  campaignView,
  nextRouteToward,
  routeProgress,
  type LatLng,
  type SaveGame,
} from '@oml/game';
import type { Region } from '@oml/spawn';
import { makeT, type Translate } from '../i18n';
import { formatM, routePercent } from '../game/goalText';
import { loadRegion } from '../game/region';
import { BadgeGrid } from '../game/Screens';
import { useBackHandler } from '../ui/backStack';
import { Button, Sheet } from '../ui/components';
import { Icon } from '../ui/icons';
import { FynMap } from './FynMap';
import { addWorldLayers, setLockedZones, setRouteProgress, setWild, setZoneLabels } from './layers';
import { markerElement, PLAYER_SVG, STAR_SVG, addAttribution, regionStart } from './markers';
import { paperStyle, type Palette } from './style';

/**
 * Town Map (M2d, GDD "Town Map", P22): a flat overview of the region in the paper style.
 * Zones (locked ones dimmed), arenas with badge state, routes with their walked part and
 * number, rest stops, the player and the Journal's target. Tapping a place shows its name,
 * straight-line distance and what it needs. No turn-by-turn directions. The Fyn button opens
 * the overview of all regions on Fyn (FynMap); back closes that first. From the Fyn map the
 * player can also open another playable region's Town Map to plan a trip there (owner
 * request): it shows that region's own progress (nothing yet before the first visit) and
 * changes nothing; play there starts by walking there. Every icon shows at every zoom; only
 * the filter hides kinds (owner request).
 */
type Selected =
  | { kind: 'arena'; arena: number }
  | { kind: 'route'; id: string }
  | { kind: 'rest'; id: string }
  | { kind: 'trainer'; id: string }
  | { kind: 'market'; id: string }
  | { kind: 'zone'; id: string };

/** What the filter can hide (D165), remembered on the phone (a view setting, not progress). */
export const LAYERS = [
  'arenas',
  'routes',
  'routeLabels',
  'trainers',
  'restStops',
  'markets',
  'destinations',
] as const;
export type LayerId = (typeof LAYERS)[number];
const FILTER_KEY = 'oml.townMap.hidden';
function loadHidden(): LayerId[] {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]') as unknown;
    return Array.isArray(v)
      ? (v.filter((x) => (LAYERS as readonly string[]).includes(x)) as LayerId[])
      : [];
  } catch {
    return [];
  }
}

/**
 * How far the Town Map pans (D172): the map frame plus a little room, so a tall phone
 * screen still fits at the furthest zoom; beyond the frame the map is plain.
 */
export function regionBounds(region: RegionId): [[number, number], [number, number]] {
  const [w, s, e, n] = MAP_FRAMES[region]!;
  return [
    [w - 0.02, s - 0.03],
    [e + 0.02, n + 0.03],
  ];
}
const TOWN = { minZoom: 10.3, maxZoom: 16, zoom: 13 };

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
  const [view, setView] = useState<RegionId>(save.region);
  const [fyn, setFyn] = useState(false);
  const [badges, setBadges] = useState(false);
  const [viewRegion, setViewRegion] = useState<Region | null>(null);
  const home = view === save.region;
  // back closes the Fyn map first, then goes from a looked-at region back to the own one
  useBackHandler(!home, () => setView(save.region));
  useBackHandler(fyn, () => setFyn(false));
  useBackHandler(badges, () => setBadges(false));
  useEffect(() => {
    if (home) return;
    let live = true;
    setViewRegion(null);
    void loadRegion(view).then((r) => live && setViewRegion(r));
    return () => {
      live = false;
    };
  }, [view, home]);
  // Another region's map reads that region's parked campaign (a new one before the first
  // visit), as a view only: nothing here is saved.
  const viewSave = campaignView(save, view);
  const tr = home ? t : makeT(save.settings.language, view);
  return (
    <>
      <RegionTownMap
        key={view}
        t={tr}
        save={viewSave}
        home={home}
        position={position}
        region={home ? region : viewRegion}
        target={home ? target : null}
        palette={palette}
        onClose={onClose}
        onFyn={() => setFyn(true)}
        onBadges={() => setBadges(true)}
      />
      {fyn && (
        <FynMap
          t={tr}
          save={save}
          viewing={view}
          palette={palette}
          onClose={() => setFyn(false)}
          onOpen={(id) => {
            setView(id);
            setFyn(false);
          }}
        />
      )}
      {badges && (
        // the badges of the region the map shows, in a sheet over the map (owner request)
        <div className="badges-sheet">
          <Sheet
            title={t('townMap.badgesOf', { region: t(`municipality.${view}.name`) })}
            closeLabel={t('townMap.close')}
            onClose={() => setBadges(false)}
            testId="townmap-badges-sheet"
          >
            <BadgeGrid
              t={t}
              tr={tr}
              region={view}
              badges={viewSave.badges}
              ordered={regions[view].open}
            />
          </Sheet>
        </div>
      )}
    </>
  );
}

function RegionTownMap({
  t,
  save,
  home,
  position,
  region,
  target,
  palette,
  onClose,
  onFyn,
  onBadges,
}: {
  t: Translate;
  save: SaveGame;
  /** The region being played (false: another region, opened from the Fyn map to look at). */
  home: boolean;
  position: LatLng | null;
  region: Region | null;
  target: LatLng | null;
  palette: Palette;
  onClose: () => void;
  onFyn: () => void;
  onBadges: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState<LayerId[]>(loadHidden);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  // P27: the Town Map is the campaign's own region
  const dex = regions[save.region];

  useEffect(() => {
    if (!ref.current) return;
    const base = appBase();
    const centre = (home && position) || regionStart(save.region);
    const map = new maplibregl.Map({
      container: ref.current,
      style: paperStyle(base, `${base}tiles/${save.region}.pmtiles`, palette),
      center: [centre.lng, centre.lat],
      zoom: TOWN.zoom,
      minZoom: TOWN.minZoom,
      maxZoom: TOWN.maxZoom,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxBounds: regionBounds(save.region),
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
        region: save.region,
        mode: 'town',
        districtName: (id) => t(`district.${id}.name`),
        zoneName: (id) => t(`zone.${id}.name`),
        routeName: (id) => t(`route.${id}.name`),
      });
      setReady(true);
    });
    for (const site of dex.arenaSites) {
      const img = document.createElement('img');
      img.alt = '';
      // the arena stamp, like the play map's stamps (owner: badges were hard to see here; they
      // stay on the Fyn map and the Badges screen); a won arena shows the stamp's done look
      const won = save.badges.includes(site.arena);
      img.src = stampUrl('arena', won);
      const el = markerElement('button', `tm-marker arena cat-arenas${won ? ' won' : ''}`, img);
      el.dataset.testid = `tm-arena-${site.arena}`;
      el.setAttribute(
        'aria-label',
        t('townMap.arenaLabel', { place: t(`arenaSite.${site.arena}.name`) }),
      );
      el.addEventListener('click', () => setSelected({ kind: 'arena', arena: site.arena }));
      add(el, site);
    }
    // Destinations (D165): what each zone is, at its centre.
    for (const z of Object.values(dex.zones)) {
      if (!z.icon) continue;
      const img = document.createElement('img');
      img.alt = '';
      img.src = stampUrl(z.icon);
      const el = markerElement('button', 'tm-marker dest cat-destinations', img);
      el.dataset.testid = `tm-zone-${z.id}`;
      el.setAttribute('aria-label', t(`zone.${z.id}.name`));
      el.addEventListener('click', () => setSelected({ kind: 'zone', id: z.id }));
      add(el, z);
    }
    // Rest stops, markets and trainers as stamps (arenas stay badges).
    for (const poi of Object.values(dex.pois)) {
      if (poi.kind === 'arena') continue;
      const img = document.createElement('img');
      img.alt = '';
      const cat =
        poi.kind === 'restStop' ? 'restStops' : poi.kind === 'market' ? 'markets' : 'trainers';
      img.src = stampUrl(
        poi.kind,
        poi.kind === 'trainer' && save.defeatedTrainers.includes(poi.trainer),
      );
      const el = markerElement('button', `tm-marker small cat-${cat}`, img);
      el.dataset.testid = `tm-${poi.kind === 'restStop' ? 'rest' : poi.kind}-${poi.id}`;
      el.setAttribute(
        'aria-label',
        poi.kind === 'trainer' ? t(`trainer.${poi.trainer}.name`) : t(`poi.${poi.id}.name`),
      );
      el.addEventListener('click', () =>
        setSelected(
          poi.kind === 'restStop'
            ? { kind: 'rest', id: poi.id }
            : poi.kind === 'market'
              ? { kind: 'market', id: poi.id }
              : { kind: 'trainer', id: poi.id },
        ),
      );
      add(el, poi);
    }
    for (const r of Object.values(dex.routes)) {
      const p = routeProgress(save, r);
      const el = markerElement(
        'button',
        `tm-marker small route cat-routeLabels ${r.kind}${p.done ? ' done' : ''}`,
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
    if (position && home) {
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
    setZoneLabels(map, save.region, (id) =>
      isZoneOpen(save, id)
        ? t(`zone.${id}.name`)
        : `${t(`zone.${id}.name`)}\n${t(dex.zones[id]?.opensOnArrival ? 'townMap.ferryIsland' : 'townMap.zoneLocked')}`,
    );
    setLockedZones(
      map,
      Object.keys(dex.zones).filter((z) => !isZoneOpen(save, z)),
    );
    setRouteProgress(map, save);
  }, [ready, region, save, t, dex]);

  // The filter (D165): hidden layers are remembered; route lines follow the routes toggle,
  // route labels (numbers and names) need both toggles on.
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(hidden));
    } catch {
      // private mode: the filter just isn't remembered
    }
    const map = mapRef.current;
    if (!map || !ready) return;
    const routesOff = hidden.includes('routes');
    const labelsOff = routesOff || hidden.includes('routeLabels');
    for (const [id, off] of [
      ['routes', routesOff],
      ['routes-walked', routesOff],
      ['route-labels', labelsOff],
    ] as const)
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', off ? 'none' : 'visible');
  }, [hidden, ready]);
  const toggle = (id: LayerId) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

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
      const site = dex.arenaSites[selected.arena - 1]!;
      title = t('townMap.arenaLabel', { place: t(`arenaSite.${site.arena}.name`) });
      icon = stampUrl('arena', save.badges.includes(site.arena));
      zone = site.zone;
      distance = away(site);
      needs = save.badges.includes(site.arena)
        ? t('townMap.badgeEarned', { badge: t(`badge.${site.arena}.name`) })
        : dex.open
          ? t('townMap.arenaTier', { n: challengeTier(save.badges) })
          : !isZoneOpen(save, site.zone)
            ? t('townMap.needsZone', { zone: t(`zone.${site.zone}.name`) })
            : !arenaReady(save, site.arena)
              ? t('townMap.needsBadge', { badge: t(`badge.${site.arena - 1}.name`) })
              : !site.poi
                ? t('townMap.later')
                : t('townMap.arenaOpen');
    } else if (selected.kind === 'route') {
      const r = dex.routes[selected.id]!;
      const p = routeProgress(save, r);
      title = t(`route.${r.id}.name`);
      icon = '';
      zone = isZoneOpen(save, r.from) ? r.to : r.from;
      distance = away(midpoint(r.path));
      needsLabel = t('townMap.progress');
      needs =
        r.kind === 'ferry'
          ? t('townMap.ferryRoute', { m: formatM(r.lengthM) })
          : p.done
            ? t('townMap.routeDone', { m: formatM(r.lengthM) })
            : t('townMap.routeProgress', {
                pct: routePercent(p.n, p.of),
                m: formatM(r.lengthM),
                wild: Math.round(r.wildShare * 100),
              });
      // P28: what walking a route is good for in an open region.
      if (dex.open && r.kind !== 'ferry')
        needs += ` · ${t(p.done ? 'townMap.routeBonus' : 'townMap.routeFinds')}`;
    } else if (selected.kind === 'zone') {
      const z = dex.zones[selected.id]!;
      title = t(`zone.${z.id}.name`);
      icon = stampUrl(z.icon ?? 'field');
      zone = z.id;
      distance = away(z);
      needsLabel = t('townMap.destination');
      const routesIn = Object.values(dex.routes)
        .filter((r) => r.from === z.id || r.to === z.id)
        .map((r) => r.number)
        .sort((a, b) => a - b);
      const next = nextRouteToward(save, z.id);
      needs = `${t(`townMap.icon.${z.icon ?? 'field'}`)} · ${t('townMap.routesIn', {
        routes: routesIn.join(', '),
      })}${next ? ` · ${t('townMap.walkRoute', { n: next.number })}` : ''}`;
    } else if (selected.kind === 'trainer') {
      const poi = dex.pois[selected.id]!;
      const trainerId = poi.kind === 'trainer' ? poi.trainer : '';
      title = t(`trainer.${trainerId}.name`);
      const beaten = save.defeatedTrainers.includes(trainerId);
      icon = stampUrl('trainer', beaten);
      zone = poi.zone;
      distance = away(poi);
      needs = beaten
        ? t('townMap.trainerBeaten')
        : !isZoneOpen(save, poi.zone)
          ? t('townMap.needsZone', { zone: t(`zone.${poi.zone}.name`) })
          : t('townMap.trainerReady', { place: t(`poi.${poi.id}.name`) });
    } else {
      const poi = dex.pois[selected.id]!;
      title = t(`poi.${poi.id}.name`);
      icon = stampUrl(poi.kind === 'market' ? 'market' : 'restStop');
      zone = poi.zone;
      distance = away(poi);
      needs = t(poi.kind === 'market' ? 'townMap.marketOpen' : 'townMap.restOpen');
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
      className={`town-map${hidden.map((h) => ` hide-${h}`).join('')}`}
      data-testid="town-map"
      data-region={save.region}
      aria-label={t('townMap.title')}
    >
      <div ref={ref} className="map" />
      {/* Owner: the four buttons crowded the top bar. The top keeps the title and the way out;
          the three tools sit at the bottom, labelled, within thumb reach. */}
      <header className="town-map-head">
        <h1>{t(`municipality.${save.region}.name`)}</h1>
        <Button
          round
          variant="ghost"
          icon="close"
          data-testid="townmap-close"
          aria-label={t('townMap.close')}
          onClick={onClose}
        />
      </header>
      <nav className="town-map-tools" aria-label={t('townMap.title')}>
        <button
          type="button"
          className={`tm-tool${filterOpen ? ' on' : ''}`}
          data-testid="townmap-filter"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((o) => !o)}
        >
          <Icon name="filter" />
          <span>{t('townMap.tool.filter')}</span>
        </button>
        <button
          type="button"
          className="tm-tool"
          data-testid="townmap-badges"
          onClick={() => {
            setSelected(null);
            setFilterOpen(false);
            onBadges();
          }}
        >
          <Icon name="badge" />
          <span>{t('townMap.tool.badges')}</span>
        </button>
        <button
          type="button"
          className="tm-tool"
          data-testid="townmap-fyn"
          onClick={() => {
            setSelected(null);
            setFilterOpen(false);
            onFyn();
          }}
        >
          <Icon name="map" />
          <span>{t('townMap.fyn')}</span>
        </button>
      </nav>
      {filterOpen && (
        <div
          className="town-map-filter"
          data-testid="townmap-filter-menu"
          role="group"
          aria-label={t('townMap.filter')}
        >
          {LAYERS.map((id) => {
            // route labels go with the routes: greyed out while the routes are hidden
            const off = id === 'routeLabels' && hidden.includes('routes');
            return (
              <label
                key={id}
                className={`filter-row${off ? ' disabled' : ''}`}
                data-testid={`filter-${id}`}
              >
                <input
                  type="checkbox"
                  role="switch"
                  disabled={off}
                  checked={!hidden.includes(id)}
                  onChange={() => toggle(id)}
                />
                <span>{t(`townMap.layer.${id}`)}</span>
              </label>
            );
          })}
        </div>
      )}
      {card}
    </section>
  );
}
