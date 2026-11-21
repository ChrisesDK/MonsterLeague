import { useCallback, useEffect, useState } from 'react';

/**
 * Which way the phone points (M2d heading indicator), in degrees clockwise from north.
 * Android/Chrome: `deviceorientationabsolute`; iOS Safari: `webkitCompassHeading`, which
 * needs a permission asked from a tap (`request`). Nothing is stored or sent anywhere.
 */
type IOSOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export function useCompassHeading(): {
  heading: number | null;
  /** iOS only: true until the player has allowed the compass. */
  needsPermission: boolean;
  request: () => void;
} {
  const [heading, setHeading] = useState<number | null>(null);
  const [allowed, setAllowed] = useState(false);
  const ios =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as IOSOrientation).requestPermission === 'function';

  useEffect(() => {
    if (typeof window === 'undefined' || (ios && !allowed)) return;
    let last = 0;
    const onAbs = (e: DeviceOrientationEvent) => {
      const now = performance.now();
      if (now - last < 100) return; // ~10 updates per second is plenty
      last = now;
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (typeof webkit === 'number') setHeading(webkit);
      else if (e.absolute && typeof e.alpha === 'number') setHeading((360 - e.alpha) % 360);
    };
    window.addEventListener('deviceorientationabsolute', onAbs as EventListener);
    window.addEventListener('deviceorientation', onAbs);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbs as EventListener);
      window.removeEventListener('deviceorientation', onAbs);
    };
  }, [ios, allowed]);

  const request = useCallback(() => {
    const req = (DeviceOrientationEvent as IOSOrientation).requestPermission;
    if (!req) return;
    req()
      .then((r) => setAllowed(r === 'granted'))
      .catch(() => undefined);
  }, []);

  return { heading, needsPermission: ios && !allowed, request };
}
