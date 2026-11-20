/**
 * Sunrise and sunset from the NOAA solar equations (no API, accurate to about a minute at
 * Odense's latitude). Pure: the caller passes the time.
 */
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunTimes {
  /** Unix seconds (UTC), or null in polar day/night (never in Denmark). */
  sunrise: number | null;
  sunset: number | null;
}

/** Sun times for the UTC calendar day containing `unixSeconds`, at the given place. */
export function sunTimes(unixSeconds: number, lat: number, lng: number): SunTimes {
  const day = Math.floor(unixSeconds / 86400);
  // Julian century from J2000, at solar noon of that day (approx).
  const jd = day + 2440587.5 + 0.5 - lng / 360;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * m)) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(l0)) -
        2 * e * Math.sin(rad(m)) +
        4 * e * y * Math.sin(rad(m)) * Math.cos(2 * rad(l0)) -
        0.5 * y * y * Math.sin(4 * rad(l0)) -
        1.25 * e * e * Math.sin(2 * rad(m)),
    );
  const cosH =
    Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) -
    Math.tan(rad(lat)) * Math.tan(rad(decl));
  if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null };
  const ha = deg(Math.acos(cosH));
  const noonMin = 720 - 4 * lng - eqTime; // minutes after 00:00 UTC
  const base = day * 86400;
  return {
    sunrise: Math.round(base + (noonMin - 4 * ha) * 60),
    sunset: Math.round(base + (noonMin + 4 * ha) * 60),
  };
}

/** True between sunset and the next sunrise. */
export function isNight(unixSeconds: number, lat: number, lng: number): boolean {
  const { sunrise, sunset } = sunTimes(unixSeconds, lat, lng);
  if (sunrise === null || sunset === null) return false;
  return unixSeconds < sunrise || unixSeconds >= sunset;
}
