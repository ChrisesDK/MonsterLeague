import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * M2d drift bug: MapLibre places a marker by setting `transform` on the marker's root
 * element. A CSS animation, transition or transform on that root overrides it, and the
 * marker slides towards the top-left of the screen. Animate an inner element instead.
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ROOT_CLASSES = ['spawn-marker', 'poi-marker', 'player-marker', 'maplibregl-marker'];

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

/** Selectors whose last compound selector (the element styled) is a marker root. */
function targetsMarkerRoot(selector: string): boolean {
  return selector.split(',').some((sel) => {
    const last =
      sel
        .trim()
        .split(/[\s>+~]+/)
        .pop() ?? '';
    return ROOT_CLASSES.some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(last));
  });
}

describe('map markers: nothing moves the marker root element', () => {
  const rules: { file: string; selector: string; body: string }[] = [];
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      rules.push({ file, selector: m[1]!.trim(), body: m[2]! });
  }

  it('finds the marker rules (the scanner works)', () => {
    expect(rules.some((r) => targetsMarkerRoot(r.selector))).toBe(true);
    expect(targetsMarkerRoot('.spawn-marker.tutorial')).toBe(true);
    expect(targetsMarkerRoot('.spawn-marker .marker-body')).toBe(false);
  });

  it('no animation, transition or transform on a marker root', () => {
    const bad = rules
      .filter((r) => targetsMarkerRoot(r.selector))
      .filter((r) =>
        /(^|[;\s])(animation|transition|transform|translate|rotate|scale)\s*:/.test(r.body),
      )
      .map((r) => `${r.selector} in ${r.file}`);
    expect(bad).toEqual([]);
  });
});
