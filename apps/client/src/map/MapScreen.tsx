import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { hintMarkerUrl, markerUrl, spriteUrl, stampUrl } from '@oml/art';
import { content, type Poi } from '@oml/data';
import type { BattleState, TurnResult } from '@oml/engine';
import {
  bearingDeg,
  collectChoices,
  finishBattle,
  healTeam,
  insidePoi,
  isDistrictUnlocked,
  journal as buildJournal,
  nearestPoi,
  noteDistrict,
  noteRoutes,
  noteWildWalk,
  placeTutorial,
  recoversAt,
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
import { latLngToCell } from 'h3-js';
import { BattleScreen } from '../BattleScreen';
import type { Translate } from '../i18n';
import { districtAt, LEVEL_BANDS, loadRegion } from '../game/region';
import { formatM, goalTitle } from '../game/goalText';
import { Button, Toast } from '../ui/components';
import { buzz } from '../ui/feedback';
import { Icon } from '../ui/icons';
import {
  BATTLE_RADIUS_M,
  MAX_ACCURACY_M,
  glideStep,
  markerInView,
  playableFix,
  SHOW_RADIUS_M,
  distanceM,
  speedKmh,
  tooFast,
  type Fix,
} from './geo';
import { useCompassHeading } from './heading';
import {
  addBuildings3d,
  fogRadii,
  buildingsRadius,
  BUILDINGS_RECENTRE_M,
  setBuildingsRange,
  setFogPalette,
  setBuildings3d,
  addWorldLayers,
  applyPatternPalette,
  setLockedDistricts,
  setWild,
} from './layers';
import { GpsLocation, type LocationSource, type SimLocation } from './location';
import { SimPanel } from './SimPanel';
import type { ApiSpawn } from './spawnApi';
import { applyPalette, NIGHT, paperStyle, PAPER } from './style';
import { markerElement, PLAYER_SVG, STAR_SVG, START } from './markers';
import { addFogWall } from './fogWall';
import { LoadingScreen } from './LoadingScreen';
import { TownMap } from './TownMap';
import { useSpawns } from './useSpawns';
import {
  attachOrbit,
  fingersDown,
  horizonForReach,
  lookAheadPadding,
  metresPerPx,
  ORBIT,
  pitchForZoom,
  skyBackground,
} from './orbit';

/** A point `metres` away from `p` towards `bearingDeg`. */
function offsetM(p: LatLng, metres: number, bearingDeg: number): LatLng {
  const b = (bearingDeg * Math.PI) / 180;
  return {
    lat: p.lat + (metres * Math.cos(b)) / 110_540,
    lng: p.lng + (metres * Math.sin(b)) / (111_320 * Math.cos((p.lat * Math.PI) / 180)),
  };
}
const toLngLat = (p: LatLng): [number, number] => [p.lng, p.lat];
/** A point this far ahead is drawn (practically) on the horizon. */
const HORIZON_M = 200_000;

const POIS: Poi[] = Object.values(content.pois);
/** POI radius circles appear when the player is this much outside the radius, or closer. */
const RADIUS_SHOW_M = 60;
/** Creatures further than this are drawn faint (GDD v1.9: visible to 200 m, faint beyond 100 m). */
const FAINT_M = 100;
/** Distance steps shorter than this are noise (GPS jitter); they are added up later. */
const MIN_STEP_M = 5;
/** The tutorial creature is placed again when the player is further away than this. */
const TUTORIAL_REPLACE_M = 600;
/** GDD v1.9 camera: always on the player, tilted 50–68° by zoom, zoom about street level. */
export const CAMERA = ORBIT;
/** Room for the heads-up display, so the player stays in the clear middle of the screen. */
/** The ground is drawn this far past the fog wall (so the wall, not the map's edge, ends it). */
const REACH_PAST_FOG_M = 300;

interface Props {
  t: Translate;
  /** Dev tools: GPS simulator instead of real GPS (dev builds and #/dev/map). */
  devTools: boolean;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onMenu: () => void;
  onJournal: () => void;
  onBadge: (arena: number) => void;
  night: boolean;
  /** Gate 3 session counters (only called while a test session runs). */
  onGate3?: (e: Gate3Event) => void;
  /** Dev tools: the GPS simulator (owned by the game so it survives menu visits). */
  sim?: SimLocation | null;
  /** Dev only: extra spawns injected by tests. */
  devSpawns?: ApiSpawn[];
}

export { START };
let protocolAdded = false;
/** The loading screen shows on the first map of a session only (not after battles). */
let loadedOnce = false;
/** Never keep the player waiting longer than this (GPS or tiles slow): show the map. */
export const LOADING_MAX_MS = 20_000;

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

const nowSeconds = () => Math.floor(Date.now() / 1000);

type ResultCard =
  | { kind: 'trainer'; trainerId: string; won: boolean; reward: BattleOutcome['reward'] }
  | { kind: 'text'; text: string };

function poiDone(p: Poi, save: SaveGame): boolean {
  if (p.kind === 'trainer') return save.defeatedTrainers.includes(p.trainer);
  if (p.kind === 'arena') return save.badges.includes(p.arena);
  return false;
}

/** Spawn-marker classes that follow the creature's state (see the marker effect). */
const STATE_CLASSES = ['hint', 'too-wild', 'tutorial', 'far', 'in-range', 'selected'];

interface Seen {
  s: ApiSpawn;
  d: number;
  st: ReturnType<typeof spawnStatus> | 'tutorial';
  level: number;
}

export function MapScreen({
  t,
  devTools,
  save,
  update,
  onMenu,
  onJournal,
  onBadge,
  night,
  onGate3,
  sim = null,
  devSpawns,
}: Props) {
  const [fixes, setFixes] = useState<Fix[]>([]);
  /** The newest accurate fix (kept through short GPS dips, see playableFix). */
  const [lastGood, setLastGood] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [inBattle, setInBattle] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [tutorialSpot, setTutorialSpot] = useState<LatLng | null>(null);
  const [result, setResult] = useState<ResultCard | null>(null);
  const [restMsg, setRestMsg] = useState<{ poiId: string; text: string } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [townMap, setTownMap] = useState(false);
  /** The Journal card and the Nearby strip are opened on demand (owner feedback). */
  const [goalOpen, setGoalOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  /** The map went idle (tiles and 3D buildings in place) after the player was placed. */
  const [townBuilt, setTownBuilt] = useState(false);
  const [loading, setLoading] = useState(!loadedOnce);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const poiMarkers = useRef(new Map<string, { marker: Marker; img: HTMLImageElement }>());
  const player = useRef<{ figure: Marker; cone: Marker } | null>(null);
  /** Where the player figure is drawn (glides towards `fixTarget`). */
  const drawnAt = useRef<LatLng | null>(null);
  const fixTarget = useRef<LatLng | null>(null);
  const accuracyM = useRef(10);
  const targetMarker = useRef<Marker | null>(null);
  const announced = useRef(new Set<string>());
  const seenForGate3 = useRef(new Set<string>());
  const timer = useRef<ActiveTimer | null>(null);
  const distAnchor = useRef<Fix | null>(null);
  const journalAnchor = useRef<Fix | null>(null);
  const wildPending = useRef(0);
  const [useSim, setUseSim] = useState(devTools && !!sim);
  const teleportMode = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const palette = night ? NIGHT : PAPER;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const compass = useCompassHeading();

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
      if (e.fix.accuracy <= MAX_ACCURACY_M) setLastGood(e.fix);
    });
  }, [useSim, sim]);

  const last = fixes[fixes.length - 1] ?? null;
  const goodFix = playableFix(last, lastGood, Date.now());
  const goodFixes = useMemo(() => fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M), [fixes]);
  const kmh = speedKmh(goodFixes);
  useEffect(() => setFast((prev) => tooFast(prev, kmh)), [kmh]);

  // Heading: the compass when the phone has one, else the direction of travel.
  const course = useMemo(() => {
    const n = goodFixes.length;
    if (n < 2) return null;
    const a = goodFixes[n - 2]!;
    const b = goodFixes[n - 1]!;
    return distanceM(a, b) >= 3 ? bearingDeg(a, b) : null;
  }, [goodFixes]);
  const heading = compass.heading ?? course;

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

  // ---- Journal progress (districts reached, route checkpoints, wild metres) --------------
  // Districts and checkpoints are noted on every fix (no change → nothing is saved); wild
  // metres only count real steps of 5 m or more at walking speed.
  useEffect(() => {
    if (!goodFix || fast || save.onboarding !== 'done') return;
    const district = districtAt(region, goodFix);
    const a = journalAnchor.current;
    if (!a) journalAnchor.current = goodFix;
    else {
      const d = distanceM(a, goodFix);
      if (d >= MIN_STEP_M) {
        const hours = Math.max(1, goodFix.time - a.time) / 3_600_000;
        const cell = region?.cells.get(latLngToCell(goodFix.lat, goodFix.lng, 10));
        if (cell?.wild && d / 1000 / hours <= 25) wildPending.current += d;
        journalAnchor.current = goodFix;
      }
    }
    const wild = wildPending.current >= 20 && district !== null ? wildPending.current : 0;
    if (wild > 0) wildPending.current = 0;
    update((s) => {
      let next = noteRoutes(noteDistrict(s, district), goodFix);
      if (wild > 0 && district !== null) next = noteWildWalk(next, district, wild);
      return next;
    });
  }, [goodFix, fast, region, save.onboarding, update]);

  const visible = useMemo<Seen[]>(() => {
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
    const start = last ?? START;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: paperStyle(base, `${base}tiles/odense.pmtiles`, paletteRef.current),
      center: [start.lng, start.lat],
      zoom: CAMERA.zoom,
      minZoom: CAMERA.minZoom,
      maxZoom: CAMERA.maxZoom,
      pitch: pitchForZoom(CAMERA.zoom),
      minPitch: CAMERA.minPitch,
      maxPitch: CAMERA.maxPitch,
      // the tilt always follows the zoom (zoomed in = looking further ahead)
      // the tilt follows the zoom, and the camera never leaves the (shown) player
      transformCameraUpdate: ({ zoom }) => ({
        pitch: pitchForZoom(zoom),
        ...(drawnAt.current
          ? { center: new maplibregl.LngLat(drawnAt.current.lng, drawnAt.current.lat) }
          : {}),
      }),
      maxBounds: [
        [10.25, 55.32],
        [10.52, 55.46],
      ],
      attributionControl: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.setPadding(lookAheadPadding(CAMERA.zoom, map.getContainer().clientHeight));
    // Look-ahead: the player sits lower on the screen the further in you zoom. Set on the
    // transform during every camera update (before the markers follow it); setPadding would
    // stop a running pinch.
    const tr = map.transform;
    map.on('move', () => {
      tr.padding = lookAheadPadding(tr.zoom, tr.height);
    });
    // The ground is drawn to just past the fog wall at every tilt, and no further (see
    // horizonForReach): nothing beyond the wall is loaded or drawn.
    tr.getHorizon = () =>
      horizonForReach(
        tr.pitch,
        tr.cameraToCenterDistance,
        metresPerPx(tr.center.lat, tr.zoom),
        saveRef.current.settings.fogDistance + REACH_PAST_FOG_M,
        tr.centerOffset.y,
      );
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      addWorldLayers(map, paletteRef.current, {
        mode: 'play',
        districtName: (id) => t(`district.${id}.name`),
        routeName: (id) => t(`route.${id}.name`),
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
        paint: { 'fill-color': paletteRef.current.accuracy, 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'player-accuracy-line',
        type: 'line',
        source: 'player',
        paint: {
          'line-color': paletteRef.current.accuracy,
          'line-width': 1.5,
          'line-opacity': 0.45,
        },
      });
      addBuildings3d(map, paletteRef.current, saveRef.current.settings.buildings3d);
      setFogPalette(map, paletteRef.current);
      // last, so it sits above every layer (far labels are hidden behind it too)
      addFogWall(
        map,
        () => fogRadii(saveRef.current.settings.fogDistance)[1],
        () => paletteRef.current.fog,
      );
      setMapReady(true);
    });
    // Drag rotates around the player; pinch and wheel zoom on the player (no panning).
    const detachOrbit = attachOrbit(map);
    map.on('rotate', () => setBearing(map.getBearing()));
    map.on('idle', () => {
      if (drawnAt.current) setTownBuilt(true);
    });
    map.on('click', (e) => {
      if (teleportMode.current && sim) sim.teleport({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    mapRef.current = map;
    // Dev tools only: automated checks can move the camera.
    if (devTools) (window as unknown as { __omlMap?: MlMap }).__omlMap = map;

    // POI stamps (drawn once; their image follows the beaten state).
    for (const poi of POIS) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = stampUrl(poi.kind, poiDone(poi, saveRef.current));
      const el = markerElement('div', `poi-marker poi-${poi.kind}`, img);
      el.dataset.poiId = poi.id;
      el.dataset.lat = String(poi.lat);
      el.dataset.lng = String(poi.lng);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', t(`poi.${poi.id}.name`));
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map);
      poiMarkers.current.set(poi.id, { marker, img });
    }

    // The player: a standing figure, plus a heading cone lying flat on the map.
    const figure = markerElement('div', 'player-marker', PLAYER_SVG);
    figure.dataset.testid = 'player-marker';
    const coneEl = document.createElement('div');
    coneEl.className = 'heading-marker';
    coneEl.innerHTML = '<div class="heading-cone"></div>';
    coneEl.style.visibility = 'hidden';
    player.current = {
      cone: new maplibregl.Marker({
        element: coneEl,
        anchor: 'center',
        pitchAlignment: 'map',
        rotationAlignment: 'map',
      })
        .setLngLat([start.lng, start.lat])
        .addTo(map),
      figure: new maplibregl.Marker({ element: figure, anchor: 'bottom', offset: [0, 6] })
        .setLngLat([start.lng, start.lat])
        .addTo(map),
    };

    const markerMap = markers.current;
    const poiMap = poiMarkers.current;
    return () => {
      for (const m of markerMap.values()) m.remove();
      markerMap.clear();
      for (const { marker } of poiMap.values()) marker.remove();
      poiMap.clear();
      player.current = null;
      targetMarker.current = null;
      detachOrbit();
      map.remove();
      mapRef.current = null;
      delete (window as unknown as { __omlMap?: MlMap }).__omlMap;
      setMapReady(false);
    };
    // `last` and `t` are read once for the initial view and labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle, sim]);

  // The 3D buildings setting can change while the map is open.
  const buildings3d = save.settings.buildings3d;
  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReady) setBuildings3d(map, buildings3d);
  }, [buildings3d, mapReady]);

  // Night style after sunset (GDD v1.9).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyPalette(map, palette);
    applyPatternPalette(map, palette);
    setFogPalette(map, palette);
  }, [palette, mapReady]);

  // Wild areas and locked districts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setWild(map, region);
  }, [region, mapReady]);
  const badgesKey = save.badges.join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const badges = badgesKey ? badgesKey.split(',').map(Number) : [];
    setLockedDistricts(
      map,
      [1, 2, 3, 4, 5, 6, 7, 8].filter((d) => !isDistrictUnlocked(badges, d)),
    );
  }, [badgesKey, mapReady]);

  // Stamp images follow beaten trainers / won arenas.
  useEffect(() => {
    for (const poi of POIS) {
      const m = poiMarkers.current.get(poi.id);
      if (m) m.img.src = stampUrl(poi.kind, poiDone(poi, save));
    }
  }, [save, mapReady]);

  // The newest playable fix (during a short GPS dip: the last accurate one) and its accuracy.
  const playerAt = goodFix ?? last;
  useEffect(() => {
    if (!playerAt || !last) return;
    fixTarget.current = { lat: playerAt.lat, lng: playerAt.lng };
    accuracyM.current = Math.min(Math.max(last.accuracy, 5), 200);
  }, [playerAt, last]);

  // POI radius circles near the player (per fix).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !playerAt) return;
    const colours = { arena: '#c8553d', trainer: '#3d6fa8', restStop: '#4f9a63' };
    (map.getSource('poi-radius') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: POIS.filter((p) => distanceM(playerAt, p) <= p.radius + RADIUS_SHOW_M).map((p) => ({
        ...circle(p, p.radius),
        properties: { colour: colours[p.kind], id: p.id },
      })),
    });
  }, [playerAt, mapReady]);

  // One frame loop moves the player: the figure glides towards the newest fix, and the
  // camera stays exactly on it. While a gesture or camera animation runs, the camera's
  // transformCameraUpdate pins the centre to the same position instead (jumpTo would cancel
  // the gesture).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let raf = 0;
    let prev = performance.now();
    let ringAt: LatLng | null = null;
    let ringAcc = -1;
    let skyCss = '';
    let buildingsAt: LatLng | null = null;
    let buildingsFog = -1;
    const frame = (now: number) => {
      // the map is removed (a battle opened) one render before this effect is cleaned up
      if (mapRef.current !== map) return;
      raf = requestAnimationFrame(frame);
      // capped so a long pause (tab in background) doesn't jump, but slow phones still keep pace
      const dt = Math.min(0.25, (now - prev) / 1000);
      prev = now;
      const goal = fixTarget.current;
      if (!goal) return;
      const before = drawnAt.current;
      const next = glideStep(before, goal, dt);
      drawnAt.current = next;
      const centre = map.getCenter();
      const offCentre =
        Math.abs(centre.lat - next.lat) > 1e-7 || Math.abs(centre.lng - next.lng) > 1e-7;
      if (next !== before) {
        player.current?.figure.setLngLat([next.lng, next.lat]);
        player.current?.cone.setLngLat([next.lng, next.lat]);
      }
      // Only when the ring really moves or changes size: re-sending it every frame kept the
      // map from ever going idle (endless re-rendering; the loading screen waited for idle).
      const acc = accuracyM.current;
      const ringMoved = !ringAt || distanceM(ringAt, next) > 0.5;
      const ringSettled = next === goal && ringAt !== goal;
      if (ringMoved || ringSettled || acc !== ringAcc) {
        ringAt = next;
        ringAcc = acc;
        (map.getSource('player') as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: [circle(next, accuracyM.current)],
        });
      }
      // the sky behind the map: sky colour at the top, fog colour at the horizon (the fog
      // wall itself is a layer in the 3D scene, see fogWall.ts)
      {
        const horizonY = map.project(toLngLat(offsetM(next, HORIZON_M, map.getBearing()))).y;
        const sky = skyBackground(horizonY, paletteRef.current.sky, paletteRef.current.fog);
        if (sky !== skyCss) {
          skyCss = sky;
          map.getContainer().style.background = sky;
        }
      }
      // 3D buildings beyond the fog are unloaded; the filter only moves every 200 m walked
      // (never on zoom), since each change re-processes the map tiles
      const fogM = saveRef.current.settings.fogDistance;
      if (
        !buildingsAt ||
        distanceM(buildingsAt, next) > BUILDINGS_RECENTRE_M ||
        fogM !== buildingsFog
      ) {
        buildingsAt = next;
        buildingsFog = fogM;
        setBuildingsRange(map, next, buildingsRadius(fogM));
      }
      // never while a finger is down: jumpTo resets MapLibre's gestures (a starting pinch
      // was lost); once a gesture runs, transformCameraUpdate keeps the camera on the player
      if (offCentre && !map.isMoving() && !fingersDown(map))
        map.jumpTo({ center: [next.lng, next.lat] });
      cullMarkers(next);
    };
    // Hide icons that can't really be on screen (behind the camera, or very far away);
    // checked a few times a second, and only touched when their state changes.
    let lastCull = 0;
    const cullMarkers = (at: LatLng) => {
      const now = performance.now();
      if (now - lastCull < 150) return;
      lastCull = now;
      const box = map.getContainer();
      const bottom = map.unproject([box.clientWidth / 2, box.clientHeight]);
      const behindM = distanceM(at, { lat: bottom.lat, lng: bottom.lng });
      const bearing = map.getBearing();
      // icons stop at the fog's solid edge (they would float in the fog)
      const maxM = fogRadii(saveRef.current.settings.fogDistance)[1];
      const show = (el: HTMLElement, p: LatLng) => {
        const v = markerInView(at, bearing, behindM, p, maxM) ? '' : 'hidden';
        if (el.style.visibility !== v) el.style.visibility = v;
      };
      for (const [id, { marker }] of poiMarkers.current) {
        const poi = content.pois[id];
        if (poi) show(marker.getElement(), poi);
      }
      for (const m of markers.current.values()) {
        const ll = m.getLngLat();
        show(m.getElement(), { lat: ll.lat, lng: ll.lng });
      }
      const tm = targetMarker.current;
      if (tm) show(tm.getElement(), { lat: tm.getLngLat().lat, lng: tm.getLngLat().lng });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mapReady]);

  useEffect(() => {
    const cone = player.current?.cone;
    if (!cone) return;
    cone.getElement().style.visibility = heading === null ? 'hidden' : 'visible';
    if (heading !== null) cone.setRotation(heading);
  }, [heading, mapReady]);

  const resetNorth = () => {
    if (compass.needsPermission) compass.request();
    mapRef.current?.easeTo({ bearing: 0, duration: 400 });
  };

  // ---- battles ---------------------------------------------------------------------------
  const openBattle = useCallback(() => {
    timer.current = timer.current ? resumeTimer(timer.current, Date.now()) : startTimer(Date.now());
    setResult(null);
    setTownMap(false);
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
      setSelected(spawn.id);
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
    setSelected('tutorial');
    if (d > BATTLE_RADIUS_M) {
      setToast(t('map.walkCloser', { name, m: Math.round(d) }));
      return;
    }
    update((cur) => startTutorialBattle(cur, Math.floor(Math.random() * 2 ** 31)));
    openBattle();
  }, [position, tutorialSpot, t, update, openBattle]);
  const tutorialTapRef = useRef(tapTutorial);
  tutorialTapRef.current = tapTutorial;

  // Creatures shown on the map and in the Nearby strip (the tutorial creature included).
  const shown = useMemo<Seen[]>(() => {
    if (!tutorialSpot || !position) return visible;
    const tut: Seen = {
      s: {
        id: 'tutorial',
        speciesId: TUTORIAL_SPECIES,
        rarity: 'common',
        levelRoll: 0,
        district: 1,
        cellId: '',
        lat: tutorialSpot.lat,
        lng: tutorialSpot.lng,
        requires: null,
        window: 0,
        expiresAt: 0,
      },
      d: distanceM(position, tutorialSpot),
      st: 'tutorial',
      level: TUTORIAL_LEVEL,
    };
    return [tut, ...visible].sort((a, b) => a.d - b.d);
  }, [visible, tutorialSpot, position]);

  // Spawn markers (pooled by spawn id; classes update in place, nothing is rebuilt per frame).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const label = ({ s, st, level }: Seen) =>
      st === 'needsAbility'
        ? t('map.hintMarker')
        : st === 'tooWild'
          ? t('map.tooWildMarker', { name: t(`species.${s.speciesId}.name`) })
          : t('map.marker', { name: t(`species.${s.speciesId}.name`), level });
    const want = new Set(shown.map((v) => v.s.id));
    for (const [id, m] of markers.current) {
      if (!want.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    for (const v of shown) {
      const { s, st, d } = v;
      const hidden = st === 'needsAbility';
      const cls =
        `spawn-marker${hidden ? ' hint' : ''}${st === 'tooWild' ? ' too-wild' : ''}` +
        `${st === 'tutorial' ? ' tutorial' : ''}${d > FAINT_M ? ' far' : ''}` +
        `${d <= BATTLE_RADIUS_M && (st === 'ok' || st === 'tutorial') ? ' in-range' : ''}` +
        `${selected === s.id ? ' selected' : ''}`;
      let m = markers.current.get(s.id);
      if (!m) {
        const img = document.createElement('img');
        img.alt = '';
        const el = markerElement('button', cls, img);
        el.dataset.spawnId = s.id;
        el.dataset.lat = String(s.lat);
        el.dataset.lng = String(s.lng);
        if (st === 'tutorial') el.dataset.testid = 'tutorial-marker';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (el.dataset.kind === 'tutorial') tutorialTapRef.current();
          else tapRef.current(s);
        });
        m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        markers.current.set(s.id, m);
      }
      const el = m.getElement();
      // Toggle only our own classes: MapLibre adds `maplibregl-marker…` classes to the same
      // element for its positioning, and replacing className would drop them (markers jump).
      const want = new Set(cls.split(' '));
      for (const c of STATE_CLASSES) el.classList.toggle(c, want.has(c));
      if (el.dataset.kind !== st) {
        el.dataset.kind = st;
        el.querySelector('img')!.src = hidden ? hintMarkerUrl() : markerUrl(s.speciesId);
      }
      const aria = label(v);
      if (el.getAttribute('aria-label') !== aria) el.setAttribute('aria-label', aria);
    }
  }, [shown, selected, t, mapReady]);

  // Encounter toast + vibration; Gate 3 "spawns seen" (battle-able ones within 100 m).
  useEffect(() => {
    for (const { s, d, st } of visible) {
      if (st === 'ok' && d <= FAINT_M && onGate3 && !seenForGate3.current.has(s.id)) {
        seenForGate3.current.add(s.id);
        onGate3({ type: 'spawnSeen' });
      }
    }
    for (const { s, d, st } of visible) {
      if (st !== 'ok' || d > BATTLE_RADIUS_M || announced.current.has(s.id)) continue;
      announced.current.add(s.id);
      buzz('encounter');
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
          <Button variant="primary" data-testid="poi-action" onClick={() => rest(here)}>
            {t('rest.button')}
          </Button>
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
        <Button variant="primary" data-testid="poi-action" onClick={() => fightPoi(here)}>
          {t('trainer.battle')}
        </Button>
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

  // ---- Journal card: always one clear goal (GDD v1.9) --------------------------------------
  const journal = useMemo(() => buildJournal(save, position), [save, position]);
  const card = (() => {
    if (!position) return null;
    let target: LatLng | null = null;
    let title: string;
    let kind = 'goal';
    let warn = false;
    let goalId = '';
    let district: number | null = null;
    if (tutorialActive && tutorialSpot) {
      const d = distanceM(position, tutorialSpot);
      target = tutorialSpot;
      kind = 'tutorial';
      title =
        d <= BATTLE_RADIUS_M
          ? t('tutorial.tap', { name: t(`species.${TUTORIAL_SPECIES}.name`) })
          : t('tutorial.walk', { m: formatM(d) });
    } else if (save.onboarding !== 'done') {
      return null;
    } else if (teamFainted(save.team)) {
      const r = nearestPoi(position, POIS, (p) => p.kind === 'restStop');
      if (!r) return null;
      target = r.poi;
      kind = 'fainted';
      warn = true;
      title = t('guide.fainted', { name: t(`poi.${r.poi.id}.name`), m: formatM(r.distance) });
      // ...or wait: fainted creatures recover by themselves after 8 hours
      const soonest = Math.min(...save.team.map((c) => recoversAt(save, c.uid) ?? Infinity));
      if (Number.isFinite(soonest)) {
        const left = Math.max(0, soonest - Math.floor(Date.now() / 1000));
        title += ` ${t('guide.faintedWait', { h: Math.floor(left / 3600), m: Math.ceil((left % 3600) / 60) })}`;
      }
    } else if (journal.current) {
      target = journal.current.target;
      title = goalTitle(journal.current, t);
      goalId = journal.current.id;
      district = journal.current.district;
    } else {
      title = t('goal.allDone');
    }
    const dist = target ? distanceM(position, target) : null;
    const arrow = target ? (bearingDeg(position, target) - bearing + 360) % 360 : null;
    const attrs = {
      'data-testid': 'journal-card',
      'data-guide': kind === 'goal' ? goalId : kind,
      'data-district': district ?? undefined,
      'data-open': goalOpen ? 'true' : 'false',
    };
    const arrowEl =
      arrow !== null ? (
        <span className="arrow" aria-hidden data-bearing={Math.round(arrow)}>
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            style={{ transform: `rotate(${Math.round(arrow)}deg)` }}
          >
            <path d="M12 3 19 20l-7-4-7 4Z" fill="currentColor" />
          </svg>
        </span>
      ) : (
        <span className="arrow" aria-hidden>
          <Icon name="journal" />
        </span>
      );
    // Closed: just the direction arrow (tap to read the goal).
    if (!goalOpen)
      return (
        <button
          type="button"
          className={`journal-card closed${warn ? ' warn' : ''}`}
          aria-label={`${title}${dist !== null ? `, ${t('hud.away', { d: formatM(dist) })}` : ''}`}
          aria-expanded={false}
          onClick={() => setGoalOpen(true)}
          {...attrs}
        >
          {arrowEl}
        </button>
      );
    return (
      <div className={`journal-card-wrap${warn ? ' warn' : ''}`}>
        <button
          type="button"
          className={`journal-card${warn ? ' warn' : ''}`}
          aria-expanded
          onClick={kind === 'tutorial' ? () => setGoalOpen(false) : onJournal}
          {...attrs}
        >
          {arrow !== null ? (
            <span className="arrow" aria-hidden data-bearing={Math.round(arrow)}>
              <svg
                viewBox="0 0 24 24"
                width="26"
                height="26"
                style={{ transform: `rotate(${Math.round(arrow)}deg)` }}
              >
                <path d="M12 3 19 20l-7-4-7 4Z" fill="currentColor" />
              </svg>
            </span>
          ) : (
            <span className="arrow" aria-hidden>
              <Icon name="journal" />
            </span>
          )}
          <span className="journal-card-text">
            <span className="journal-card-kicker">
              {t(
                kind === 'tutorial'
                  ? 'hud.firstSteps'
                  : kind === 'fainted'
                    ? 'hud.urgent'
                    : 'hud.next',
              )}
            </span>
            <span className="journal-card-title">{title}</span>
            {dist !== null && kind !== 'tutorial' && (
              <span className="journal-card-dist">{t('hud.away', { d: formatM(dist) })}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          className="journal-collapse"
          data-testid="journal-collapse"
          aria-label={t('hud.collapse')}
          onClick={() => setGoalOpen(false)}
        >
          <Icon name="back" size={20} />
        </button>
      </div>
    );
  })();

  // The Journal target on the play map.
  const target =
    !tutorialActive && save.onboarding === 'done' ? (journal.current?.target ?? null) : null;
  const targetKey = target ? `${target.lat},${target.lng}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!targetKey) {
      targetMarker.current?.remove();
      targetMarker.current = null;
      return;
    }
    const [lat, lng] = targetKey.split(',').map(Number) as [number, number];
    if (!targetMarker.current) {
      const el = document.createElement('div');
      el.className = 'target-marker';
      el.dataset.testid = 'target-marker';
      el.innerHTML = `<div class="target-body">${STAR_SVG}</div>`;
      targetMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
    } else targetMarker.current.setLngLat([lng, lat]);
  }, [targetKey, mapReady]);

  // ---- loading screen: position found and the town built (or a timeout / GPS error) ------
  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => setLoadingTimedOut(true), LOADING_MAX_MS);
    return () => clearTimeout(id);
  }, [loading]);
  const loadingDone = (!!goodFix && townBuilt) || loadingTimedOut || !!gpsError;
  useEffect(() => {
    if (!loading || !loadingDone) return;
    loadedOnce = true;
    const id = setTimeout(() => setLoading(false), 450); // fade out
    return () => clearTimeout(id);
  }, [loading, loadingDone]);

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
        : !goodFix
          ? null // no or weak GPS: a small signal icon instead (below)
          : fast
            ? t('map.tooFast')
            : status === 'no-signal'
              ? t('map.noSignal')
              : status === 'cached'
                ? t('map.cached')
                : null;
  /** Poor or missing GPS (owner feedback: an icon, not a sentence). */
  const poorSignal =
    gpsError !== 'denied' && !goodFix
      ? gpsError
        ? t('map.gps.unavailable')
        : !last
          ? t('map.gps.waiting')
          : t('map.gps.weak', { m: Math.round(last.accuracy) })
      : null;
  const battleable = visible.filter((v) => v.st === 'ok').length;
  const nearbyState = ({ st, d, s }: Seen) =>
    st === 'tooWild'
      ? { cls: 'too-wild', text: t('hud.nearby.tooWild') }
      : st === 'needsAbility'
        ? {
            cls: 'needs-ability',
            text: t('hud.nearby.needsAbility', { ability: t(`fieldAbility.${s.requires}.name`) }),
          }
        : d <= BATTLE_RADIUS_M && (st === 'ok' || st === 'tutorial')
          ? { cls: 'in-range', text: t('hud.nearby.inRange') }
          : { cls: '', text: '' };

  return (
    <main className="map-screen" data-night={night ? 'true' : 'false'}>
      <div ref={containerRef} className="map" data-testid="play-map" />
      <div className="hud-top">
        <div className="hud-left">
          {card}
          {banner && (
            <div className="map-banner" role="status">
              {banner}
            </div>
          )}
          {toast && (
            <div className="map-toast">
              <Toast>{toast}</Toast>
            </div>
          )}
        </div>
        <div className="hud-right">
          <button
            type="button"
            className="btn round hud-btn"
            data-testid="compass-button"
            aria-label={t('hud.compass')}
            onClick={resetNorth}
          >
            <span className="compass-rose" style={{ transform: `rotate(${-bearing}deg)` }}>
              <Icon name="compass" size={28} />
            </span>
          </button>
          <Button
            round
            className="hud-btn"
            icon="map"
            data-testid="townmap-button"
            aria-label={t('hud.townMap')}
            onClick={() => setTownMap(true)}
          />
          {poorSignal && (
            <span
              className="signal-icon"
              role="status"
              data-testid="gps-signal"
              aria-label={poorSignal}
              title={poorSignal}
            >
              <Icon name="signal" size={24} />
            </span>
          )}
        </div>
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
      <div className="hud-bottom">
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
            <Button onClick={() => setResult(null)}>{t('ui.ok')}</Button>
          </div>
        )}
        {!result && poiCard}
        {nearbyOpen && (
          <div
            className="nearby"
            data-testid="nearby-count"
            data-count={battleable}
            aria-label={t('hud.nearby.label')}
          >
            {shown.length === 0 ? (
              <span className="nearby-empty">{t('hud.nearby.none')}</span>
            ) : (
              shown.map((v) => {
                const ns = nearbyState(v);
                return (
                  <button
                    key={v.s.id}
                    type="button"
                    className={`nearby-chip ${ns.cls}${selected === v.s.id ? ' selected' : ''}`}
                    data-testid="nearby-chip"
                    data-spawn={v.s.id}
                    onClick={() => {
                      if (selected === v.s.id) {
                        if (v.st === 'tutorial') tapTutorial();
                        else tapSpawn(v.s);
                      } else setSelected(v.s.id);
                    }}
                    aria-label={`${t(`species.${v.s.speciesId}.name`)}, ${formatM(v.d)}${ns.text ? `, ${ns.text}` : ''}`}
                  >
                    <img
                      src={v.st === 'needsAbility' ? hintMarkerUrl() : spriteUrl(v.s.speciesId)}
                      alt=""
                    />
                    <span className="nearby-dist">{formatM(v.d)}</span>
                    {ns.text && <span className="nearby-state">{ns.text}</span>}
                  </button>
                );
              })
            )}
          </div>
        )}
        <div className="hud-bar">
          <div className="hud-bar-side">
            <button
              type="button"
              className={`btn round hud-btn nearby-btn${nearbyOpen ? ' on' : ''}`}
              data-testid="nearby-button"
              data-count={battleable}
              aria-expanded={nearbyOpen}
              aria-label={t('hud.nearby.button', { n: shown.length })}
              onClick={() => setNearbyOpen(!nearbyOpen)}
            >
              <Icon name="paw" size={26} />
              {shown.length > 0 && <span className="nearby-badge">{shown.length}</span>}
            </button>
            {save.battle && !inBattle && (
              <Button variant="primary" data-testid="resume-battle" onClick={openBattle}>
                {t('map.resume')}
              </Button>
            )}
          </div>
          <button
            type="button"
            className="satchel-btn"
            data-testid="menu-button"
            aria-label={t('hud.menu')}
            onClick={onMenu}
          >
            <Icon name="satchel" />
            <span>{t('hud.menu')}</span>
          </button>
          <div className="hud-bar-side right" />
        </div>
      </div>
      {loading && (
        <LoadingScreen t={t} located={!!goodFix} built={townBuilt} leaving={loadingDone} />
      )}
      {townMap && (
        <TownMap
          t={t}
          save={save}
          position={position}
          region={region}
          target={target}
          palette={palette}
          onClose={() => setTownMap(false)}
        />
      )}
    </main>
  );
}
