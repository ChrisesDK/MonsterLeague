import { describe, expect, it } from 'vitest';
import { findBaseViolations, urlOk } from '../scripts/check-base';

const BASE = '/OdenseMonsterLeague/';

describe('base-path check', () => {
  it('accepts relative, external and base-prefixed URLs', () => {
    for (const u of [
      'assets/a.js',
      './x',
      'https://x.dk/a',
      'data:image/svg+xml,x',
      '#/dev',
      `${BASE}assets/a.js`,
    ]) {
      expect(urlOk(u, BASE)).toBe(true);
    }
    expect(urlOk('/assets/a.js', BASE)).toBe(false);
    expect(urlOk('//cdn.x/a.js', BASE)).toBe(false);
    expect(urlOk('/assets/a.js', '/')).toBe(true);
  });

  it('finds unprefixed URLs in html, css, manifest and the sw registration', () => {
    const problems = findBaseViolations(
      [
        {
          path: 'index.html',
          text: `<script src="/assets/a.js"></script><link href="${BASE}a.css"><script src="${BASE}registerSW.js"></script>`,
        },
        {
          path: 'assets/a.css',
          text: `.x{background:url(/img/a.png)} .y{background:url("${BASE}b.png")}`,
        },
        {
          path: 'manifest.webmanifest',
          text: JSON.stringify({ start_url: '/', scope: '.', icons: [{ src: '/icon.svg' }] }),
        },
        {
          path: 'registerSW.js',
          text: `navigator.serviceWorker.register('/sw.js', { scope: '${BASE}' })`,
        },
      ],
      BASE,
    );
    expect(problems).toHaveLength(5);
    expect(problems.join('\n')).toMatch(/attribute "\/assets\/a.js"/);
    expect(problems.join('\n')).toMatch(/css url "\/img\/a.png"/);
    expect(problems.join('\n')).toMatch(/start_url "\/"/);
    expect(problems.join('\n')).toMatch(/icon "\/icon.svg"/);
    expect(problems.join('\n')).toMatch(/sw url "\/sw.js"/);
  });

  it('requires a service-worker registration and manifest scope', () => {
    const problems = findBaseViolations(
      [
        { path: 'index.html', text: '<div></div>' },
        { path: 'manifest.webmanifest', text: '{}' },
      ],
      BASE,
    );
    expect(problems.join('\n')).toMatch(/no service-worker registration/);
    expect(problems.join('\n')).toMatch(/missing start_url/);
    expect(problems.join('\n')).toMatch(/missing scope/);
  });
});
