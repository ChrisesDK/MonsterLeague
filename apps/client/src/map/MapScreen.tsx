import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { hintMarkerUrl, markerUrl } from '@oml/art';
import districtsRaw from '@oml/data/content/districts.odense.geojson?raw';

const districtsGeo = JSON.parse(districtsRaw) as GeoJSON.FeatureCollection;
import type { BattleState } from '@oml/engine';
import { BattleScreen } from '../BattleScreen';
import type { Translate } from '../i18n';
import {
  BATTLE_RADIUS_M,
  MAX_ACCURACY_M,
  SHOW_RADIUS_M,
  distanceM,
  speedKmh,
  tooFast,
  type Fix,
} from './geo';
import { GpsLocation, SimLocation, type LocationSource } from './location';
import { battleForSpawn, loadMapBattle, saveMapBattle, type SavedMapBattle } from './mapBattle';
import { SimPanel } from './SimPanel';
import { loadUsed, saveUsed } from './spawnCache';
import type { ApiSpawn } from './spawnApi';
import { paperStyle, PAPER } from './style';
import { useSpawns } from './useSpawns';

interface Props {
  t: Translate;
  /** Dev tools: GPS simulator instead of real GPS (dev builds and #/dev/map). */
  devTools: boolean;
}

const START = { lat: 55.3998, lng: 10.3852 }; // Kongens Have
let protocolAdded = false;

function appBase(): string {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

/** Accuracy ring as a GeoJSON polygon. */
function circle(
  center: { lat: number; lng: number },
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
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
    // Browsers block vibration until the user has interacted with the page.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch {
    // not supported
  }
};

export function MapScreen({ t, devTools }: Props) {
  const [explained, setExplained] = useState(devTools);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [battle, setBattle] = useState<SavedMapBattle | null>(null);
  const [paused, setPaused] = useState<SavedMapBattle | null>(() => loadMapBattle());
  const [used, setUsed] = useState(() => loadUsed(Math.floor(Date.now() / 1000)));
  const [follow, setFollow] = useState(true);
  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const announced = useRef(new Set<string>());
  const sim = useMemo(() => (devTools ? new SimLocation(START) : null), [devTools]);
  const [useSim, setUseSim] = useState(devTools);

  // Dev tools only: let automated checks drive the simulator (never in the player map).
  useEffect(() => {
    if (!sim) return;
    (window as unknown as { __omlSim?: SimLocation }).__omlSim = sim;
    return () => {
      delete (window as unknown as { __omlSim?: SimLocation }).__omlSim;
    };
  }, [sim]);
  const teleportMode = useRef(false);

  // Skip the explanation if location permission was already granted.
  useEffect(() => {
    if (explained) return;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => p.state === 'granted' && setExplained(true))
      .catch(() => undefined);
  }, [explained]);

  // Location stream (real GPS or simulator).
  useEffect(() => {
    if (!explained || battle) return;
    const source: LocationSource = useSim && sim ? sim : new GpsLocation();
    return source.subscribe((e) => {
      if ('error' in e) return setGpsError(e.error);
      setGpsError(null);
      setFixes((prev) => [...prev.slice(-9), e.fix]);
    });
  }, [explained, useSim, sim, battle]);

  const last = fixes[fixes.length - 1] ?? null;
  const goodFix = last && last.accuracy <= MAX_ACCURACY_M ? last : null;
  const kmh = speedKmh(fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M));
  useEffect(() => setFast((prev) => tooFast(prev, kmh)), [kmh]);

  const posLat = goodFix?.lat;
  const posLng = goodFix?.lng;
  const position = useMemo(
    () => (posLat !== undefined && posLng !== undefined ? { lat: posLat, lng: posLng } : null),
    [posLat, posLng],
  );
  const { spawns, status, versionDrift } = useSpawns(position);

  const visible = useMemo(() => {
    if (!position || fast) return [];
    return spawns
      .filter((s) => !used.has(s.id))
      .map((s) => ({ s, d: distanceM(position, s) }))
      .filter(({ d }) => d <= SHOW_RADIUS_M)
      .sort((a, b) => a.d - b.d);
  }, [spawns, position, used, fast]);

  // ---- map setup ------------------------------------------------------------------------
  useEffect(() => {
    if (!explained || battle || !containerRef.current) return;
    if (!protocolAdded) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolAdded = true;
    }
    const base = appBase();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: paperStyle(base, `${base}tiles/odense.pmtiles`),
      center: [START.lng, START.lat],
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
    });
    map.on('dragstart', () => setFollow(false));
    map.on('click', (e) => {
      if (teleportMode.current && sim) sim.teleport({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    mapRef.current = map;
    const markerMap = markers.current;
    return () => {
      for (const m of markerMap.values()) m.remove();
      markerMap.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [explained, battle, sim]);

  // Player dot + follow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !last) return;
    const update = () => {
      const src = map.getSource('player') as GeoJSONSource | undefined;
      src?.setData({
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
      if (follow) map.easeTo({ center: [last.lng, last.lat], duration: 600 });
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [last, follow]);

  const startBattle = useCallback((spawn: ApiSpawn) => {
    const b = { spawnId: spawn.id, expiresAt: spawn.expiresAt, state: battleForSpawn(spawn) };
    saveMapBattle(b);
    setPaused(null);
    setBattle(b);
  }, []);

  const tapSpawn = useCallback(
    (spawn: ApiSpawn) => {
      const name = t(`species.${spawn.speciesId}.name`);
      if (!position) return;
      if (spawn.requires) {
        setToast(t('map.hint', { ability: t(`fieldAbility.${spawn.requires}.name`) }));
        return;
      }
      const d = distanceM(position, spawn);
      if (d > BATTLE_RADIUS_M) setToast(t('map.walkCloser', { name, m: Math.round(d) }));
      else startBattle(spawn);
    },
    [position, startBattle, t],
  );

  // Markers live longer than one render: their click handlers call the latest tapSpawn
  // through this ref, so distance checks use the current position (not the one at creation).
  const tapRef = useRef(tapSpawn);
  tapRef.current = tapSpawn;

  // Spawn markers within 100 m.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const want = new Set(visible.map((v) => v.s.id));
    for (const [id, m] of markers.current) {
      if (!want.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    for (const { s } of visible) {
      if (markers.current.has(s.id)) continue;
      const el = document.createElement('button');
      el.className = `spawn-marker${s.requires ? ' hint' : ''}`;
      el.setAttribute(
        'aria-label',
        s.requires
          ? t('map.hintMarker')
          : t('map.marker', { name: t(`species.${s.speciesId}.name`), level: s.level }),
      );
      el.dataset.spawnId = s.id;
      el.dataset.lat = String(s.lat);
      el.dataset.lng = String(s.lng);
      const img = document.createElement('img');
      img.src = s.requires ? hintMarkerUrl() : markerUrl(s.speciesId);
      img.alt = '';
      el.appendChild(img);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        tapRef.current(s);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
      // MapLibre sets a generic "Map marker" label; restore the creature name for screen readers.
      el.setAttribute(
        'aria-label',
        s.requires
          ? t('map.hintMarker')
          : t('map.marker', { name: t(`species.${s.speciesId}.name`), level: s.level }),
      );
      markers.current.set(s.id, marker);
    }
  }, [visible, t]);

  // Encounter toast + vibration when a battle-able spawn comes within 40 m.
  useEffect(() => {
    for (const { s, d } of visible) {
      if (s.requires || d > BATTLE_RADIUS_M || announced.current.has(s.id)) continue;
      announced.current.add(s.id);
      vibrate(120);
      setToast(t('map.encounter', { name: t(`species.${s.speciesId}.name`) }));
      break;
    }
  }, [visible, t]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const finishBattle = (stillRunning: boolean, state: BattleState) => {
    if (!battle) return;
    if (stillRunning) {
      const p = { ...battle, state };
      saveMapBattle(p);
      setPaused(p);
    } else {
      saveMapBattle(null);
      const next = new Map(used).set(battle.spawnId, battle.expiresAt);
      setUsed(next);
      saveUsed(next);
      setToast(t(`ui.result.${state.result}`));
    }
    setBattle(null);
  };

  // ---- render -----------------------------------------------------------------------------
  if (battle) {
    return (
      <BattleScreen
        key={battle.spawnId}
        initial={battle.state}
        t={t}
        onSave={(state) => saveMapBattle({ ...battle, state })}
        onExit={finishBattle}
        endLabel={t('ui.continue')}
      />
    );
  }

  if (!explained) {
    return (
      <main className="setup">
        <header className="setup-header">
          <h1>{t('map.explain.title')}</h1>
          <p>{t('map.explain.body')}</p>
        </header>
        <p className="notice">{t('map.explain.safety')}</p>
        <button className="btn primary wide" onClick={() => setExplained(true)}>
          {t('map.explain.allow')}
        </button>
        <a className="btn wide link-btn" href="#/playtest">
          {t('map.toPlaytest')}
        </a>
      </main>
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
  const battleable = visible.filter((v) => !v.s.requires).length;

  return (
    <main className="map-screen">
      <div ref={containerRef} className="map" />
      {banner && (
        <div className="map-banner" role="status">
          {banner}
          {status === 'not-configured' && (
            <a className="btn small-btn" href="#/playtest">
              {t('map.toPlaytest')}
            </a>
          )}
        </div>
      )}
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
        {paused && (
          <button
            className="btn primary"
            onClick={() => {
              setBattle(paused);
              setPaused(null);
            }}
          >
            {t('map.resume')}
          </button>
        )}
        <div className="map-bottom-row">
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
