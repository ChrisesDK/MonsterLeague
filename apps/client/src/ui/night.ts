import { useEffect, useState } from 'react';
import { isNight } from '@oml/spawn';

/** Odense's centre: sunrise and sunset for the night style (same NOAA code as spawns). */
const ODENSE = { lat: 55.3959, lng: 10.3883 };

export function nightNow(nowMs = Date.now()): boolean {
  return isNight(Math.floor(nowMs / 1000), ODENSE.lat, ODENSE.lng);
}

/** True between sunset and sunrise; re-checked every minute. */
export function useNight(): boolean {
  const [night, setNight] = useState(nightNow);
  useEffect(() => {
    const id = setInterval(() => setNight(nightNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return night;
}
