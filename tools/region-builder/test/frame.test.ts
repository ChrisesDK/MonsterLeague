import { readFileSync } from 'node:fs';
import { bbox } from '@turf/turf';
import { MAP_FRAME_MARGIN_KM, MAP_FRAMES } from '@oml/data';
import { describe, expect, it } from 'vitest';

describe('map frame (D172)', () => {
  it.each(['odense', 'svendborg'] as const)(
    "%s: the region's bounding box plus an even margin on every side",
    (region) => {
      const boundary = JSON.parse(
        readFileSync(
          new URL(`../../../packages/data/content/${region}/boundary.geojson`, import.meta.url),
          'utf8',
        ),
      );
      const [w, s, e, n] = bbox(boundary);
      const [fw, fs, fe, fn] = MAP_FRAMES[region]!;
      const kx = 111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180);
      const margins = [(w - fw) * kx, (s - fs) * 110.54, (fe - e) * kx, (fn - n) * 110.54];
      for (const m of margins) expect(Math.abs(m - MAP_FRAME_MARGIN_KM)).toBeLessThan(0.1);
    },
  );
});
