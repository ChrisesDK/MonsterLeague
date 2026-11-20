import { distanceM, type Fix } from './geo';

export type LocationEvent = { fix: Fix } | { error: 'denied' | 'unavailable' | 'timeout' };
export type LocationListener = (e: LocationEvent) => void;

/** Anything that produces position fixes: the real GPS or the dev simulator. */
export interface LocationSource {
  subscribe(listener: LocationListener): () => void;
}

/** Real device GPS via watchPosition (high accuracy). Positions never leave the phone. */
export class GpsLocation implements LocationSource {
  subscribe(listener: LocationListener): () => void {
    if (!('geolocation' in navigator)) {
      listener({ error: 'unavailable' });
      return () => undefined;
    }
    const id = navigator.geolocation.watchPosition(
      (p) =>
        listener({
          fix: {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            time: p.timestamp,
            speed: p.coords.speed,
          },
        }),
      (err) =>
        listener({
          error:
            err.code === err.PERMISSION_DENIED
              ? 'denied'
              : err.code === err.TIMEOUT
                ? 'timeout'
                : 'unavailable',
        }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Parses the track points of a GPX file. */
export function parseGpx(text: string): LatLng[] {
  const out: LatLng[] = [];
  const re = /<trkpt\b[^>]*?\blat="(-?[\d.]+)"[^>]*?\blon="(-?[\d.]+)"/g;
  for (const m of text.matchAll(re)) out.push({ lat: Number(m[1]), lng: Number(m[2]) });
  return out;
}

/** Position `meters` along a polyline (clamped to its end). */
export function along(points: readonly LatLng[], meters: number): { at: LatLng; done: boolean } {
  let left = meters;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = distanceM(a, b);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return {
        at: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        done: false,
      };
    }
    left -= seg;
  }
  return { at: points[points.length - 1] ?? { lat: 0, lng: 0 }, done: true };
}

export const WALKING_SPEED_MS = 1.4;
/** Fake speed for testing the "too fast" rule: 40 km/h. */
export const FAKE_FAST_MS = 40 / 3.6;
const TICK_MS = 1000;

export interface SimState {
  mode: 'idle' | 'walking';
  speedFactor: number;
  fakeFast: boolean;
  position: LatLng;
}

/**
 * Dev GPS simulator (dev builds and #/dev/map only): teleport, GPX walk at walking speed
 * (× a factor for quick checks), and a fake 40 km/h toggle for the speed rule.
 */
export class SimLocation implements LocationSource {
  private listeners = new Set<LocationListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private walked = 0;
  private route: LatLng[] = [];
  state: SimState;
  onChange?: (s: SimState) => void;

  constructor(start: LatLng) {
    this.state = { mode: 'idle', speedFactor: 1, fakeFast: false, position: start };
  }

  /** The clock runs while someone listens (survives React StrictMode's double mount). */
  subscribe(listener: LocationListener): () => void {
    this.listeners.add(listener);
    // Keep emitting so the map keeps a fresh fix while standing still.
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    queueMicrotask(() => this.emit());
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  teleport(p: LatLng): void {
    this.state = { ...this.state, mode: 'idle', position: p };
    this.emit();
  }

  walk(route: LatLng[], speedFactor: number): void {
    if (route.length < 2) return;
    this.route = route;
    this.walked = 0;
    this.state = { ...this.state, mode: 'walking', speedFactor, position: route[0]! };
    this.emit();
  }

  stop(): void {
    this.state = { ...this.state, mode: 'idle' };
    this.emit();
  }

  setFakeFast(on: boolean): void {
    this.state = { ...this.state, fakeFast: on };
    this.emit();
  }

  setSpeedFactor(f: number): void {
    this.state = { ...this.state, speedFactor: f };
    this.onChange?.(this.state);
  }

  private tick(): void {
    if (this.state.mode === 'walking') {
      this.walked += WALKING_SPEED_MS * this.state.speedFactor * (TICK_MS / 1000);
      const { at, done } = along(this.route, this.walked);
      this.state = { ...this.state, position: at, mode: done ? 'idle' : 'walking' };
    }
    this.emit();
  }

  private emit(): void {
    // A ×5/×20 walk is a time-lapse of walking, so it reports walking speed; only the
    // explicit "fake 40 km/h" toggle trips the speed rule.
    const speed = this.state.fakeFast
      ? FAKE_FAST_MS
      : this.state.mode === 'walking'
        ? WALKING_SPEED_MS
        : 0;
    const fix: Fix = { ...this.state.position, accuracy: 5, time: Date.now(), speed };
    for (const l of this.listeners) l({ fix });
    this.onChange?.(this.state);
  }
}
