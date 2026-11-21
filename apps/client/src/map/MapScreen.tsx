import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { hintMarkerUrl, markerUrl, stampUrl } from '@oml/art';
import { content, type Poi } from '@oml/data';
import districtsRaw from '@oml/data/content/districts.odense.geojson?raw';
import type { BattleState, TurnResult } from '@oml/engine';
import {
  bearingDeg,
  collectChoices,
  finishBattle,
  healTeam,
  insidePoi,
  nearestPoi,
  onboardingTargets,
  placeTutorial,
  restockReadyAt,
  spawnLevel,
  spawnStatus,
  startTrainerBattle,
  startTutorialBattle,
  startWildBattle,
  teamFainted,
  trainerStatus,
  tutorialDex,
  visitRestStop,
  TUTORIAL_LEVEL,
  TUTORIAL_SPECIES,
  type BattleOutcome,
  type LatLng,
  type SaveGame,
} from '@oml/game';
import {
  pauseTimer,
  readTimer,
  resumeTimer,
  startTimer,
  type ActiveTimer,
  type Gate3Event,
} from '@oml/playtest';
import type { Region } from '@oml/spawn';
import { BattleScreen } from '../BattleScreen';
import type { Translate } from '../i18n';
import { districtAt, LEVEL_BANDS, loadRegion } from '../game/region';
import {
  BATTLE_RADIUS_M,
  MAX_ACCURACY_M,
  SHOW_RADIUS_M,
  distanceM,
  speedKmh,
  tooFast,
  type Fix,
} from './geo';
import { GpsLocation, type LocationSource, type SimLocation } from './location';
import { SimPanel } from './SimPanel';
import type { ApiSpawn } from './spawnApi';
import { paperStyle, PAPER } from './style';
import { useSpawns } from './useSpawns';

const districtsGeo = JSON.parse(districtsRaw) as GeoJSON.FeatureCollection;
const POIS: Poi[] = Object.values(content.pois);
/** POI radius circles appear when the player is this much outside the radius, or closer. */
const RADIUS_SHOW_M = 60;
/** Distance steps shorter than this are noise (GPS jitter); they are added up later. */
const MIN_STEP_M = 5;
/** The tutorial creature is placed again when the player is further away than this. */
const TUTORIAL_REPLACE_M = 600;

interface Props {
  t: Translate;
  /** Dev tools: GPS simulator instead of real GPS (dev builds and #/dev/map). */
  devTools: boolean;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onMenu: () => void;
  onBadge: (arena: number) => void;
  /** Gate 3 session counters (only called while a test session runs). */
  onGate3?: (e: Gate3Event) => void;
  /** Dev tools: the GPS simulator (owned by the game so it survives menu visits). */
  sim?: SimLocation | null;
  /** Dev only: extra spawns injected by tests. */
  devSpawns?: ApiSpawn[];
}

export const START = { lat: 55.3998, lng: 10.3852 }; // Kongens Have
let protocolAdded = false;

function appBase(): string {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

function circle(center: LatLng, radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    pts.push([
      center.lng + (radiusM * Math.sin(a)) / (111_320 * Math.cos((center.lat * Math.PI) / 180)),
      center.lat + (radiusM * Math.cos(a)) / 110_540,
    ]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

const vibrate = (ms: number) => {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch {
    // not supported
  }
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

function formatM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function Arrow({ bearing }: { bearing: number }) {
  return (
    <span className="arrow" aria-hidden data-bearing={Math.round(bearing)}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        style={{ transform: `rotate(${Math.round(bearing)}deg)` }}
      >
        <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

type ResultCard =
  | { kind: 'trainer'; trainerId: string; won: boolean; reward: BattleOutcome['reward'] }
  | { kind: 'text'; text: string };

function poiKindOf(p: Poi): 'arena' | 'trainer' | 'restStop' {
  return p.kind;
}

function poiDone(p: Poi, save: SaveGame): boolean {
  if (p.kind === 'trainer') return save.defeatedTrainers.includes(p.trainer);
  if (p.kind === 'arena') return save.badges.includes(p.arena);
  return false;
}

export function MapScreen({
  t,
  devTools,
  save,
  update,
  onMenu,
  onBadge,
  onGate3,
  sim = null,
  devSpawns,
}: Props) {
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [inBattle, setInBattle] = useState(false);
  const [follow, setFollow] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [tutorialSpot, setTutorialSpot] = useState<LatLng | null>(null);
  const [result, setResult] = useState<ResultCard | null>(null);
  const [restMsg, setRestMsg] = useState<{ poiId: string; text: string } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const poiMarkers = useRef(new Map<string, { marker: Marker; img: HTMLImageElement }>());
  const announced = useRef(new Set<string>());
  const seenForGate3 = useRef(new Set<string>());
  const timer = useRef<ActiveTimer | null>(null);
  const distAnchor = useRef<Fix | null>(null);
  const [useSim, setUseSim] = useState(devTools && !!sim);
  const teleportMode = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    let alive = true;
    loadRegion()
      .then((r) => alive && setRegion(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Location stream (real GPS or simulator). Kept running during battles for distance.
  useEffect(() => {
    const source: LocationSource = useSim && sim ? sim : new GpsLocation();
    return source.subscribe((e) => {
      if ('error' in e) return setGpsError(e.error);
      setGpsError(null);
      setFixes((prev) => [...prev.slice(-9), e.fix]);
    });
  }, [useSim, sim]);

  const last = fixes[fixes.length - 1] ?? null;
  const goodFix = last && last.accuracy <= MAX_ACCURACY_M ? last : null;
  const kmh = speedKmh(fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M));
  useEffect(() => setFast((prev) => tooFast(prev, kmh)), [kmh]);

  // Gate 3: distance walked, summed on the phone (only the metres leave this function).
  useEffect(() => {
    if (!onGate3 || !goodFix) return;
    const a = distAnchor.current;
    if (!a) {
      distAnchor.current = goodFix;
      return;
    }
    const d = distanceM(a, goodFix);
    if (d < MIN_STEP_M) return;
    const hours = Math.max(1, goodFix.time - a.time) / 3_600_000;
    if (d / 1000 / hours <= 25) onGate3({ type: 'distance', metres: d });
    distAnchor.current = goodFix;
  }, [goodFix, onGate3]);

  const posLat = goodFix?.lat;
  const posLng = goodFix?.lng;
  const position = useMemo(
    () => (posLat !== undefined && posLng !== undefined ? { lat: posLat, lng: posLng } : null),
    [posLat, posLng],
  );
  const service = useSpawns(position);
  const { status, versionDrift } = service;
  const spawns = useMemo(
    () => (devSpawns?.length ? [...service.spawns, ...devSpawns] : service.spawns),
    [service.spawns, devSpawns],
  );
  const playerDistrict = position ? districtAt(region, position) : null;

  const visible = useMemo(() => {
    if (!position || fast) return [];
    return spawns
      .map((s) => ({
        s,
        d: distanceM(position, s),
        st: spawnStatus(save, s),
        level: spawnLevel(s, save.badges, LEVEL_BANDS),
      }))
      .filter(({ d, st }) => d <= SHOW_RADIUS_M && st !== 'used')
      .sort((a, b) => a.d - b.d);
  }, [spawns, position, fast, save]);

  // ---- tutorial creature (personal, not a shared spawn; position kept in memory only) ----
  const tutorialActive = save.onboarding === 'tutorial' && !save.battle;
  useEffect(() => {
    if (!tutorialActive) {
      setTutorialSpot(null);
      return;
    }
    if (!position || !region) return;
    // Place it once; again only if the player ended up far away (e.g. a poor first fix).
    if (tutorialSpot && distanceM(position, tutorialSpot) <= TUTORIAL_REPLACE_M) return;
    setTutorialSpot(placeTutorial(position, region, Math.random));
  }, [tutorialActive, tutorialSpot, position, region]);

  // ---- map setup ------------------------------------------------------------------------
  useEffect(() => {
    if (inBattle || !containerRef.current) return;
    if (!protocolAdded) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolAdded = true;
    }
    const base = appBase();
    const start = saveRef.current && last ? last : START;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: paperStyle(base, `${base}tiles/odense.pmtiles`),
      center: [start.lng, start.lat],
      zoom: 16.5,
      minZoom: 12,
      maxZoom: 19,
      maxBounds: [
        [10.25, 55.32],
        [10.52, 55.46],
      ],
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left');
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      map.addSource('districts', { type: 'geojson', data: districtsGeo });
      map.addLayer({
        id: 'districts',
        type: 'line',
        source: 'districts',
        paint: {
          'line-color': PAPER.district,
          'line-width': 2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.7,
        },
      });
      map.addSource('poi-radius', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'poi-radius-fill',
        type: 'fill',
        source: 'poi-radius',
        paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'poi-radius-line',
        type: 'line',
        source: 'poi-radius',
        paint: { 'line-color': ['get', 'colour'], 'line-width': 2, 'line-dasharray': [2, 2] },
      });
      map.addSource('player', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'player-accuracy',
        type: 'fill',
        source: 'player',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'player-dot',
        type: 'circle',
        source: 'player',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 9,
          'circle-color': '#2563eb',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 3,
        },
      });
      setMapReady(true);
    });
    map.on('dragstart', () => setFollow(false));
    map.on('click', (e) => {
      if (teleportMode.current && sim) sim.teleport({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    mapRef.current = map;
    // Dev tools only: automated checks can move the camera.
    if (devTools) (window as unknown as { __omlMap?: MlMap }).__omlMap = map;

    // POI stamps (drawn once; their image follows the beaten state).
    for (const poi of POIS) {
      const el = document.createElement('div');
      el.className = `poi-marker poi-${poi.kind}`;
      el.dataset.poiId = poi.id;
      el.setAttribute('role', 'img');
      const img = document.createElement('img');
      img.alt = '';
      img.src = stampUrl(poiKindOf(poi), poiDone(poi, saveRef.current));
      el.appendChild(img);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map);
      el.setAttribute('aria-label', t(`poi.${poi.id}.name`));
      poiMarkers.current.set(poi.id, { marker, img });
    }

    const markerMap = markers.current;
    const poiMap = poiMarkers.current;
    return () => {
      for (const m of markerMap.values()) m.remove();
      markerMap.clear();
      for (const { marker } of poiMap.values()) marker.remove();
      poiMap.clear();
      map.remove();
      mapRef.current = null;
      delete (window as unknown as { __omlMap?: MlMap }).__omlMap;
      setMapReady(false);
    };
    // `last` and `t` are read once for the initial view and labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle, sim]);

  // Stamp images follow beaten trainers / won arenas.
  useEffect(() => {
    for (const poi of POIS) {
      const m = poiMarkers.current.get(poi.id);
      if (m) m.img.src = stampUrl(poiKindOf(poi), poiDone(poi, save));
    }
  }, [save, mapReady]);

  // Player dot + follow + POI radius circles near the player.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !last) return;
    (map.getSource('player') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [
        circle(last, Math.min(last.accuracy, 200)),
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
        },
      ],
    });
    const colours = { arena: '#c8553d', trainer: '#3d6fa8', restStop: '#4f9a63' };
    (map.getSource('poi-radius') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: POIS.filter((p) => distanceM(last, p) <= p.radius + RADIUS_SHOW_M).map((p) => ({
        ...circle(p, p.radius),
        properties: { colour: colours[p.kind], id: p.id },
      })),
    });
    if (follow) map.easeTo({ center: [last.lng, last.lat], duration: 600 });
  }, [last, follow, mapReady]);

  // ---- battles ---------------------------------------------------------------------------
  const openBattle = useCallback(() => {
    timer.current = timer.current ? resumeTimer(timer.current, Date.now()) : startTimer(Date.now());
    setResult(null);
    setInBattle(true);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (!timer.current || !inBattle) return;
      timer.current = document.hidden
        ? pauseTimer(timer.current, Date.now())
        : resumeTimer(timer.current, Date.now());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [inBattle]);

  const tapSpawn = useCallback(
    (spawn: ApiSpawn) => {
      if (!position) return;
      const s = saveRef.current;
      const name = t(`species.${spawn.speciesId}.name`);
      const district = spawn.district;
      const st = spawnStatus(s, spawn);
      if (st === 'needsAbility') {
        setToast(t('map.hint', { ability: t(`fieldAbility.${spawn.requires}.name`) }));
        return;
      }
      if (st === 'tooWild') {
        setToast(t('map.tooWild', { name, badge: t(`badge.${Math.max(1, district - 1)}.name`) }));
        return;
      }
      if (st === 'teamFainted') return setToast(t('map.teamFainted'));
      if (st === 'used') return setToast(t('map.used'));
      if (st === 'noTeam') return;
      const d = distanceM(position, spawn);
      if (d > BATTLE_RADIUS_M) {
        setToast(t('map.walkCloser', { name, m: Math.round(d) }));
        return;
      }
      // GDD v1.7: the level is per player (own band for commons, district band for rares).
      const level = spawnLevel(spawn, s.badges, LEVEL_BANDS);
      update((cur) =>
        startWildBattle(cur, { ...spawn, level }, Math.floor(Math.random() * 2 ** 31)),
      );
      onGate3?.({ type: 'spawnBattled' });
      openBattle();
    },
    [position, t, update, onGate3, openBattle],
  );
  const tapRef = useRef(tapSpawn);
  tapRef.current = tapSpawn;

  const tapTutorial = useCallback(() => {
    if (!position || !tutorialSpot) return;
    const d = distanceM(position, tutorialSpot);
    const name = t(`species.${TUTORIAL_SPECIES}.name`);
    if (d > BATTLE_RADIUS_M) {
      setToast(t('map.walkCloser', { name, m: Math.round(d) }));
      return;
    }
    update((cur) => startTutorialBattle(cur, Math.floor(Math.random() * 2 ** 31)));
    openBattle();
  }, [position, tutorialSpot, t, update, openBattle]);
  const tutorialTapRef = useRef(tapTutorial);
  tutorialTapRef.current = tapTutorial;

  // Spawn markers within 100 m (+ the tutorial creature).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const label = (s: ApiSpawn, st: string, level: number) =>
      st === 'needsAbility'
        ? t('map.hintMarker')
        : st === 'tooWild'
          ? t('map.tooWildMarker', { name: t(`species.${s.speciesId}.name`) })
          : t('map.marker', { name: t(`species.${s.speciesId}.name`), level });
    const want = new Map(visible.map((v) => [v.s.id, v]));
    if (tutorialSpot) want.set('tutorial', null as never);
    for (const [id, m] of markers.current) {
      const v = want.get(id);
      const kind = (m.getElement().dataset.kind ?? '') as string;
      if (!want.has(id) || (v && v.st !== kind)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    for (const { s, st, level } of visible) {
      if (markers.current.has(s.id)) continue;
      const el = document.createElement('button');
      const hidden = st === 'needsAbility';
      el.className = `spawn-marker${hidden ? ' hint' : ''}${st === 'tooWild' ? ' too-wild' : ''}`;
      el.dataset.spawnId = s.id;
      el.dataset.kind = st;
      el.dataset.lat = String(s.lat);
      el.dataset.lng = String(s.lng);
      const img = document.createElement('img');
      img.src = hidden ? hintMarkerUrl() : markerUrl(s.speciesId);
      img.alt = '';
      el.appendChild(img);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        tapRef.current(s);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
      el.setAttribute('aria-label', label(s, st, level));
      markers.current.set(s.id, marker);
    }
    if (tutorialSpot && !markers.current.has('tutorial')) {
      const el = document.createElement('button');
      el.className = 'spawn-marker tutorial';
      el.dataset.testid = 'tutorial-marker';
      el.dataset.kind = 'tutorial';
      el.dataset.lat = String(tutorialSpot.lat);
      el.dataset.lng = String(tutorialSpot.lng);
      const img = document.createElement('img');
      img.src = markerUrl(TUTORIAL_SPECIES);
      img.alt = '';
      el.appendChild(img);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        tutorialTapRef.current();
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([tutorialSpot.lng, tutorialSpot.lat])
        .addTo(map);
      el.setAttribute(
        'aria-label',
        t('map.marker', { name: t(`species.${TUTORIAL_SPECIES}.name`), level: TUTORIAL_LEVEL }),
      );
      markers.current.set('tutorial', marker);
    }
  }, [visible, tutorialSpot, t, mapReady]);

  // Encounter toast + vibration; Gate 3 "spawns seen" (battle-able ones within 100 m).
  useEffect(() => {
    for (const { s, st } of visible) {
      if (st === 'ok' && onGate3 && !seenForGate3.current.has(s.id)) {
        seenForGate3.current.add(s.id);
        onGate3({ type: 'spawnSeen' });
      }
    }
    for (const { s, d, st } of visible) {
      if (st !== 'ok' || d > BATTLE_RADIUS_M || announced.current.has(s.id)) continue;
      announced.current.add(s.id);
      vibrate(120);
      setToast(t('map.encounter', { name: t(`species.${s.speciesId}.name`) }));
      break;
    }
  }, [visible, t, onGate3]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const onTurn = useCallback(
    (r: TurnResult) => {
      update((cur) =>
        cur.battle
          ? {
              ...cur,
              battle: { ...cur.battle, state: r.state },
              pending: collectChoices(r.events, cur.pending),
            }
          : cur,
      );
    },
    [update],
  );

  const exitBattle = (stillRunning: boolean, state: BattleState) => {
    if (timer.current) timer.current = pauseTimer(timer.current, Date.now());
    if (stillRunning) {
      setInBattle(false);
      return;
    }
    const cur = saveRef.current;
    const battle = cur.battle;
    if (!battle) {
      setInBattle(false);
      return;
    }
    const out = finishBattle(cur, state, []);
    let next = out.save;
    const kind = state.kind;
    onGate3?.({
      type: 'battle',
      kind,
      won: out.won,
      activeMs: timer.current ? readTimer(timer.current, Date.now()) : 0,
      turns: state.turn,
    });
    timer.current = null;
    if (out.caught) onGate3?.({ type: 'catch' });
    if (battle.kind === 'tutorial') {
      if (out.caught) {
        setResult({
          kind: 'text',
          text: t('tutorial.caught', { name: t(`species.${out.caught.speciesId}.name`) }),
        });
      } else {
        // The tutorial never strands a new player: heal and place another creature.
        next = healTeam(next);
        setTutorialSpot(null);
        setToast(t('tutorial.again'));
      }
    } else if (battle.kind === 'trainer') {
      if (out.won) onGate3?.({ type: 'trainerBeaten' });
      setResult({ kind: 'trainer', trainerId: battle.trainerId, won: out.won, reward: out.reward });
    } else if (out.caught) {
      setResult({
        kind: 'text',
        text: t(out.caughtTo === 'storage' ? 'map.caughtStorage' : 'map.caughtTeam', {
          name: t(`species.${out.caught.speciesId}.name`),
        }),
      });
    } else if (!out.won && teamFainted(next.team)) {
      setResult({ kind: 'text', text: t('map.lostWild') });
    } else {
      setToast(t(`ui.result.${state.result}`));
    }
    update(() => next);
    setInBattle(false);
    if (out.badge) onBadge(out.badge);
  };

  // ---- POIs ----------------------------------------------------------------------------------
  const here = position
    ? (POIS.filter((p) => insidePoi(position, p)).sort(
        (a, b) => distanceM(position, a) - distanceM(position, b),
      )[0] ?? null)
    : null;

  const fightPoi = (poi: Poi) => {
    const st = trainerStatus(saveRef.current, poi);
    if (!st || st.kind !== 'ready') return;
    update((cur) =>
      startTrainerBattle(cur, poi.id, st.trainerId, Math.floor(Math.random() * 2 ** 31)),
    );
    openBattle();
  };

  const rest = (poi: Poi) => {
    const r = visitRestStop(saveRef.current, poi, nowSeconds());
    update(() => r.save);
    onGate3?.({ type: 'restVisit' });
    const parts = [t(r.healed ? 'rest.healed' : 'rest.alreadyHealthy')];
    if (r.restocked) {
      parts.push(
        t('rest.restocked', {
          items: Object.entries(r.restocked)
            .map(([id, n]) => `${n}× ${t(`item.${id}.name`)}`)
            .join(', '),
        }),
      );
    } else {
      const mins = Math.max(1, Math.ceil((restockReadyAt(r.save, poi.id) - nowSeconds()) / 60));
      parts.push(t('rest.restockLater', { min: mins }));
    }
    setRestMsg({ poiId: poi.id, text: parts.join(' ') });
  };

  const poiCard = (() => {
    // GDD: no encounters or prompts above 25 km/h.
    if (!here || fast || save.onboarding !== 'done') return null;
    const title = t(`poi.${here.id}.name`);
    if (here.kind === 'restStop') {
      return (
        <div className="poi-card" data-testid="poi-card" data-poi={here.id}>
          <img src={stampUrl('restStop')} alt="" className="poi-card-stamp" />
          <div>
            <strong>{title}</strong>
            <p className="muted small">
              {restMsg?.poiId === here.id ? restMsg.text : t('rest.prompt')}
            </p>
          </div>
          <button className="btn primary" data-testid="poi-action" onClick={() => rest(here)}>
            {t('rest.button')}
          </button>
        </div>
      );
    }
    const st = trainerStatus(save, here)!;
    let body: string;
    let action: React.ReactNode = null;
    if (st.kind === 'locked') {
      body = t('trainer.refuse', { badge: t(`badge.${st.badge}.name`) });
    } else if (st.kind === 'beaten') {
      body =
        here.kind === 'arena'
          ? t('arena.won', { badge: t(`badge.${here.arena}.name`) })
          : t(`trainer.${st.trainerId}.defeated`);
    } else if (st.kind === 'teamFainted' || st.kind === 'noTeam') {
      body = t('map.teamFainted');
    } else {
      const who = t(`trainer.${st.trainerId}.name`);
      const isLeader = content.trainers[st.trainerId]?.tier === 'leader';
      body = `${who}: “${t(`trainer.${st.trainerId}.intro`)}”`;
      if (here.kind === 'arena')
        body = `${t(isLeader ? 'arena.leaderNext' : 'arena.juniorFirst')} ${body}`;
      action = (
        <button className="btn primary" data-testid="poi-action" onClick={() => fightPoi(here)}>
          {t('trainer.battle')}
        </button>
      );
    }
    return (
      <div className="poi-card" data-testid="poi-card" data-poi={here.id} data-state={st.kind}>
        <img src={stampUrl(here.kind, poiDone(here, save))} alt="" className="poi-card-stamp" />
        <div>
          <strong>{title}</strong>
          <p className="small">{body}</p>
        </div>
        {action}
      </div>
    );
  })();

  // ---- guidance ----------------------------------------------------------------------------
  const guide = (() => {
    if (!position) return null;
    if (tutorialActive && tutorialSpot) {
      const d = distanceM(position, tutorialSpot);
      const b = bearingDeg(position, tutorialSpot);
      return (
        <div className="guide-card" data-testid="guide-card" data-guide="tutorial">
          <Arrow bearing={b} />
          <span>
            {d <= BATTLE_RADIUS_M
              ? t('tutorial.tap', { name: t(`species.${TUTORIAL_SPECIES}.name`) })
              : t('tutorial.walk', { m: formatM(d) })}
          </span>
        </div>
      );
    }
    if (save.onboarding !== 'done') return null;
    if (teamFainted(save.team)) {
      const r = nearestPoi(position, POIS, (p) => p.kind === 'restStop');
      if (!r) return null;
      return (
        <div className="guide-card warn" data-testid="guide-card" data-guide="fainted">
          <Arrow bearing={r.bearing} />
          <span>
            {t('guide.fainted', { name: t(`poi.${r.poi.id}.name`), m: formatM(r.distance) })}
          </span>
        </div>
      );
    }
    if (save.defeatedTrainers.length === 0 && !here) {
      const targets = onboardingTargets(position, playerDistrict, save.defeatedTrainers);
      return (
        <div className="guide-card" data-testid="guide-card" data-guide="district1">
          {targets.trainer && (
            <span className="guide-row">
              <Arrow bearing={targets.trainer.bearing} />
              {t('guide.trainer', {
                name: t(`poi.${targets.trainer.poi.id}.name`),
                m: formatM(targets.trainer.distance),
              })}
            </span>
          )}
          {targets.restStop && (
            <span className="guide-row">
              <Arrow bearing={targets.restStop.bearing} />
              {t('guide.restStop', {
                name: t(`poi.${targets.restStop.poi.id}.name`),
                m: formatM(targets.restStop.distance),
              })}
            </span>
          )}
        </div>
      );
    }
    return null;
  })();

  // ---- render -----------------------------------------------------------------------------
  if (inBattle && save.battle) {
    const isTutorial = save.battle.kind === 'tutorial';
    return (
      <BattleScreen
        key={save.battle.kind === 'wild' ? save.battle.spawnId : save.battle.kind}
        initial={save.battle.state}
        t={t}
        speed={save.settings.speed}
        reduceMotion={save.settings.reduceMotion}
        dex={isTutorial ? tutorialDex() : content}
        onSave={() => undefined}
        onTurn={onTurn}
        askChoices={false}
        guide={isTutorial ? t('tutorial.battleGuide') : undefined}
        onExit={exitBattle}
        endLabel={t('ui.continue')}
      />
    );
  }

  const banner =
    status === 'not-configured'
      ? t('map.notConfigured')
      : gpsError === 'denied'
        ? t('map.gps.denied')
        : gpsError
          ? t('map.gps.unavailable')
          : !last
            ? t('map.gps.waiting')
            : !goodFix
              ? t('map.gps.weak', { m: Math.round(last.accuracy) })
              : fast
                ? t('map.tooFast')
                : status === 'no-signal'
                  ? t('map.noSignal')
                  : status === 'cached'
                    ? t('map.cached')
                    : status === 'loading' || status === 'waiting'
                      ? t('map.loading')
                      : null;
  const battleable = visible.filter((v) => v.st === 'ok').length;

  return (
    <main className="map-screen">
      <div ref={containerRef} className="map" />
      <div className="map-top">
        {banner && (
          <div className="map-banner" role="status">
            {banner}
          </div>
        )}
        {guide}
      </div>
      {devTools && versionDrift.length > 0 && (
        <div className="dev-warning" role="status" data-testid="version-drift">
          {t('dev.versionMismatch', { fields: versionDrift.join(', ') })}
        </div>
      )}
      {devTools && sim && (
        <SimPanel
          t={t}
          sim={sim}
          useSim={useSim}
          onUseSim={setUseSim}
          onTeleportMode={(on) => (teleportMode.current = on)}
        />
      )}
      {toast && (
        <div className="map-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <div className="map-bottom">
        {result && (
          <div className="poi-card result-card" data-testid="result-card" role="status">
            <div>
              {result.kind === 'trainer' ? (
                <>
                  <strong>
                    {t(result.won ? 'trainer.won' : 'trainer.lost', {
                      name: t(`trainer.${result.trainerId}.name`),
                    })}
                  </strong>
                  <p className="small">
                    {result.won
                      ? `“${t(`trainer.${result.trainerId}.defeated`)}”`
                      : t('map.lostTrainer')}
                  </p>
                  {result.reward && (
                    <p className="small" data-testid="reward">
                      {t('trainer.reward', {
                        n: result.reward.count,
                        item: t(`item.${result.reward.itemId}.name`),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="small">{result.text}</p>
              )}
            </div>
            <button className="btn" onClick={() => setResult(null)}>
              {t('ui.ok')}
            </button>
          </div>
        )}
        {!result && poiCard}
        {save.battle && !inBattle && (
          <button className="btn primary" data-testid="resume-battle" onClick={openBattle}>
            {t('map.resume')}
          </button>
        )}
        <div className="map-bottom-row">
          <button className="btn menu-btn" data-testid="menu-button" onClick={onMenu}>
            {t('menu.open')}
          </button>
          <span className="map-nearby" data-testid="nearby-count" data-count={battleable}>
            {battleable === 0
              ? t('map.nearbyNone')
              : battleable === 1
                ? t('map.nearbyOne')
                : t('map.nearby', { n: battleable })}
          </span>
          {!follow && (
            <button className="btn small-btn" onClick={() => setFollow(true)}>
              {t('map.center')}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
