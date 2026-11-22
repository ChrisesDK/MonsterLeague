import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * M2d map checks: markers stay glued to their position while animated, panned and zoomed
 * (the drifting-creature regression).
 */

const dev = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([f, a]) => {
      const d = (window as unknown as { __omlDev: Record<string, (...x: unknown[]) => unknown> })
        .__omlDev;
      return d[f as string]!(...(a as unknown[]));
    },
    [fn, args] as const,
  );
const teleport = (page: Page, p: { lat: number; lng: number }) =>
  page.evaluate(
    (q) =>
      (
        window as unknown as { __omlSim: { teleport: (x: { lat: number; lng: number }) => void } }
      ).__omlSim.teleport(q),
    p,
  );

const KONGENS_HAVE = { lat: 55.3992, lng: 10.3852 };

/** Max distance in px between each marker's anchor and map.project(its lngLat). */
async function markerOffsets(page: Page): Promise<{ id: string; px: number }[]> {
  // measure only while the camera stands still (the follow camera eases back after a pan)
  await page.waitForFunction(
    () => !(window as unknown as { __omlMap: { isMoving: () => boolean } }).__omlMap.isMoving(),
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  return page.evaluate(() => {
    type M = { project: (l: [number, number]) => { x: number; y: number } };
    const map = (window as unknown as { __omlMap: M & { getContainer: () => HTMLElement } })
      .__omlMap;
    const box = map.getContainer().getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.spawn-marker, .poi-marker')]
      .filter((el) => el.dataset.lat && el.dataset.lng)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const p = map.project([Number(el.dataset.lng), Number(el.dataset.lat)]);
        // spawns are anchored at the bottom centre, POI stamps at the centre
        const ax = r.left + r.width / 2 - box.left;
        const ay =
          (el.classList.contains('poi-marker') ? r.top + r.height / 2 : r.bottom) - box.top;
        return {
          id: el.dataset.spawnId ?? el.dataset.poiId ?? el.dataset.testid ?? '?',
          px: Math.hypot(ax - p.x, ay - p.y),
          // only markers the player can see count (off-screen ones aren't laid out reliably)
          onScreen: p.x >= 0 && p.y >= 0 && p.x <= box.width && p.y <= box.height,
        };
      })
      .filter((o) => o.onScreen);
  });
}

test('animated markers stay on their position while the map pans and zooms', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/dev/map');
  // through onboarding, so the (animated) tutorial creature is on the map
  await page.getByTestId('onboarding-safety').waitFor();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('starter-gnistkat').click();
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.waitForFunction(() => '__omlSim' in window && '__omlMap' in window);
  await teleport(page, KONGENS_HAVE);
  // stand by the (animated) tutorial creature, with two more creatures close by
  const tut = page.getByTestId('tutorial-marker');
  await tut.waitFor({ state: 'attached', timeout: 30_000 });
  const spot = await tut.evaluate((e) => ({
    lat: Number((e as HTMLElement).dataset.lat),
    lng: Number((e as HTMLElement).dataset.lng),
  }));
  await teleport(page, spot);
  await dev(page, 'injectSpawn', {
    speciesId: 'torvdue',
    district: 1,
    lat: spot.lat + 0.0002,
    lng: spot.lng + 0.0003,
  });
  await dev(page, 'injectSpawn', {
    speciesId: 'grimaelling',
    district: 1,
    lat: spot.lat - 0.0002,
    lng: spot.lng - 0.0003,
  });
  await expect(page.locator('.spawn-marker')).toHaveCount(3);
  // the player (and camera) glide to the new spot: wait until they have arrived
  await expect
    .poll(
      () =>
        page.evaluate((p) => {
          const c = (
            window as unknown as { __omlMap: { getCenter: () => { lat: number; lng: number } } }
          ).__omlMap.getCenter();
          return Math.hypot((c.lat - p.lat) * 110_540, (c.lng - p.lng) * 63_300);
        }, spot),
      { timeout: 10_000 },
    )
    .toBeLessThan(1);

  const moves = [
    { zoom: 17.5, offset: [0, 0] },
    { zoom: 18.2, offset: [60, -40] },
    { zoom: 16.8, offset: [-80, 50] },
  ];
  for (const m of moves) {
    await page.evaluate(({ zoom, offset }) => {
      const map = (window as unknown as { __omlMap: { jumpTo: (o: unknown) => void } }).__omlMap;
      map.jumpTo({ zoom });
      (
        window as unknown as { __omlMap: { panBy: (o: number[], x: unknown) => void } }
      ).__omlMap.panBy(offset, { duration: 0 });
    }, m);
    // sample across the idle animation (1.4 s bob) after each move
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(400);
      const offsets = await markerOffsets(page);
      expect(offsets.length).toBeGreaterThanOrEqual(3);
      for (const o of offsets) expect(o.px, `marker ${o.id} at zoom ${m.zoom}`).toBeLessThan(4);
    }
  }
});

interface RouteJson {
  routes: { id: string; path: [number, number][] }[];
}
const route1 = (
  JSON.parse(
    readFileSync(
      new URL('../../../packages/data/content/routes.odense.json', import.meta.url),
      'utf8',
    ),
  ) as RouteJson
).routes.find((r) => r.id === 'route1')!;

/** Points every ~15 m along a [lng, lat] path. */
function along(path: [number, number][], stepM = 15): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    const d = Math.hypot((by - ay) * 110_540, (bx - ax) * 63_300);
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let k = 0; k < n; k++)
      out.push({ lng: ax + ((bx - ax) * k) / n, lat: ay + ((by - ay) * k) / n });
  }
  const [lx, ly] = path[path.length - 1]!;
  out.push({ lng: lx, lat: ly });
  return out;
}

async function startDone(page: Page) {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await page.evaluate(() =>
    (
      window as unknown as { __omlDev: { skipOnboarding: (s: string) => void } }
    ).__omlDev.skipOnboarding('gnistkat'),
  );
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.waitForFunction(() => '__omlSim' in window && '__omlMap' in window);
  // the loading screen covers the map until the town is built (slow in CI): touches and
  // clicks must reach the map
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 30_000 });
}

type Cam = { pitch: number; zoom: number; bearing: number };
const camera = (page: Page) =>
  page.evaluate(() => {
    const m = (
      window as unknown as {
        __omlMap: { getPitch: () => number; getZoom: () => number; getBearing: () => number };
      }
    ).__omlMap;
    return { pitch: m.getPitch(), zoom: m.getZoom(), bearing: m.getBearing() } as Cam;
  });

test('play camera: always on the player; drag rotates, zoom tilts (no panning)', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.waitForTimeout(1500);
  const centreOffset = () =>
    page.evaluate(
      ([lat, lng]) => {
        const m = (
          window as unknown as {
            __omlMap: { getCenter: () => { lat: number; lng: number } };
          }
        ).__omlMap;
        const c = m.getCenter();
        return Math.hypot((c.lat - lat!) * 110_540, (c.lng - lng!) * 63_300);
      },
      [KONGENS_HAVE.lat, KONGENS_HAVE.lng],
    );
  let cam = await camera(page);
  expect(cam.zoom).toBeCloseTo(17.5, 1);
  expect(cam.pitch).toBeCloseTo(53, 0); // halfway between 30 (zoomed out) and 76 (zoomed in)
  const jump = (o: Record<string, number>) =>
    page.evaluate(
      // returns nothing: jumpTo returns the whole map object, and sending that back to the
      // test (serialising its tile caches) can exhaust the page's memory
      (x) => {
        (window as unknown as { __omlMap: { jumpTo: (o: unknown) => void } }).__omlMap.jumpTo(x);
      },
      o,
    );
  // zoom limits, and the tilt follows the zoom
  await jump({ zoom: 20 });
  cam = await camera(page);
  expect(cam.zoom).toBeCloseTo(18.5, 1);
  expect(cam.pitch).toBeCloseTo(76, 0);
  await jump({ zoom: 13 });
  cam = await camera(page);
  expect(cam.zoom).toBeCloseTo(16.5, 1);
  expect(cam.pitch).toBeCloseTo(30, 0);
  await jump({ zoom: 17.5 });
  await page.waitForTimeout(800);
  // a one-finger drag across the screen turns the map around the player; it never pans
  const box = (await page.getByTestId('play-map').boundingBox())!;
  const before = await camera(page);
  await page.mouse.move(box.x + 330, box.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 330, box.y + 300 + i * 25);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await camera(page);
  const turned = Math.abs(((after.bearing - before.bearing + 540) % 360) - 180);
  expect(turned).toBeGreaterThan(15);
  expect(await centreOffset()).toBeLessThan(3);
  // a horizontal swipe above the player turns the map (the screen follows the finger at
  // any distance; below the player, at Kongens Have, the arena card covers the map)
  const fig = (await page.getByTestId('player-marker').boundingBox())!;
  const swipe = async (y: number) => {
    const b0 = await camera(page);
    await page.mouse.move(box.x + 15, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 15 + i * 30, y);
    await page.mouse.up();
    await page.waitForTimeout(700); // includes any fling
    const b1 = await camera(page);
    return Math.abs(((b1.bearing - b0.bearing + 540) % 360) - 180);
  };
  expect(await swipe(fig.y - 170)).toBeGreaterThan(25);
  expect(await centreOffset()).toBeLessThan(3);
  // the wheel zooms on the player, not on the mouse
  // (wheel events are dispatched on the map, off-centre: mobile emulation in CI ignores
  // Playwright's mouse wheel)
  await expect
    .poll(
      async () => {
        await page.evaluate(
          ({ x, y }) => {
            const el = document.querySelector('.maplibregl-canvas')!;
            el.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: -200,
                clientX: x,
                clientY: y,
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          { x: box.x + 40, y: box.y + 250 },
        );
        await page.waitForTimeout(400);
        return (await camera(page)).zoom;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(17.6);
  // the camera settles back on the player (the next GPS fix re-centres it)
  await expect.poll(centreOffset, { timeout: 10_000 }).toBeLessThan(3);
  await expect(page.getByTestId('recentre-button')).toHaveCount(0);
  // a GPS correction: the figure glides there (no snap) and the camera stays on it
  const figureOffset = () =>
    page.evaluate(() => {
      const map = (
        window as unknown as {
          __omlMap: {
            getContainer: () => HTMLElement;
            project: (c: unknown) => { x: number; y: number };
            getCenter: () => unknown;
          };
        }
      ).__omlMap;
      const box = map.getContainer().getBoundingClientRect();
      const fig = document.querySelector('[data-testid=player-marker]')!.getBoundingClientRect();
      const c = map.project(map.getCenter());
      // the figure is anchored at its feet (bottom centre, 6 px offset)
      return {
        dx: fig.left + fig.width / 2 - box.left - c.x,
        dy: fig.bottom - 6 - box.top - c.y,
      };
    });
  await teleport(page, { lat: KONGENS_HAVE.lat + 0.0002, lng: KONGENS_HAVE.lng });
  // wait until it starts moving (slow renderers in CI take a moment), then it must be
  // somewhere on the way (a snap would jump the whole ≈ 22 m at once)
  await expect.poll(centreOffset, { timeout: 5000, intervals: [16] }).toBeGreaterThan(0.2);
  const mid = await centreOffset();
  expect(mid).toBeLessThan(21);
  for (let i = 0; i < 5; i++) {
    const o = await figureOffset();
    expect(Math.hypot(o.dx, o.dy)).toBeLessThan(3); // camera on the figure, also mid-glide
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => centreOffset(), { timeout: 5000 }).toBeGreaterThan(20);
  await teleport(page, KONGENS_HAVE);
  await expect.poll(centreOffset, { timeout: 15_000 }).toBeLessThan(0.5);
  // the compass turns north up again
  await page.getByTestId('compass-button').click();
  await expect.poll(async () => Math.abs((await camera(page)).bearing)).toBeLessThan(0.5);
});

test('Town Map: districts, arenas and routes; a card tells what a place needs', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.getByTestId('townmap-button').click();
  await expect(page.getByTestId('town-map')).toBeVisible();
  await page.waitForFunction(() => '__omlTownMap' in window);
  const pitch = await page.evaluate(() =>
    (window as unknown as { __omlTownMap: { getPitch: () => number } }).__omlTownMap.getPitch(),
  );
  expect(pitch).toBe(0);
  for (let a = 1; a <= 8; a++) await expect(page.getByTestId(`tm-arena-${a}`)).toHaveCount(1);
  await expect(page.getByTestId('tm-route-route1')).toHaveCount(1);
  await expect(page.getByTestId('tm-player')).toHaveCount(1);
  await expect(page.getByTestId('tm-target')).toHaveCount(1);
  await page.getByTestId('tm-arena-2').evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId('townmap-needs')).toContainText('Kongens Have badge');
  await expect(page.getByTestId('townmap-distance')).toContainText('straight line');
  await page.getByTestId('tm-route-route1').evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId('townmap-card')).toContainText('Route 1');
  await page.getByTestId('townmap-close').click();
  await expect(page.getByTestId('town-map')).toHaveCount(0);
});

test('Journal: walking Route 1 with the GPS simulator completes its goal', async ({ page }) => {
  await startDone(page);
  await dev(page, 'setBadges', [1]);
  await teleport(page, KONGENS_HAVE);
  const card = page.getByTestId('journal-card');
  await expect(card).toHaveAttribute('data-guide', 'd2.reach');
  // walk the route, a step every 15 m
  for (const p of along(route1.path)) {
    await teleport(page, p);
    await page.waitForTimeout(120);
  }
  await expect
    .poll(async () => {
      const s = (await dev(page, 'save')) as {
        journal: { routes: Record<string, number[]>; reached: number[] };
      };
      return [s.journal.reached.includes(2), (s.journal.routes.route1 ?? []).length];
    })
    .toEqual([true, expect.any(Number)]);
  // reach and route are done: the card moves on to the district's trainers
  await expect(card).toHaveAttribute('data-guide', 'd2.trainers');
  // the goal card starts folded: the first tap opens it, the next opens the Journal
  await expect(card).toHaveAttribute('data-open', 'false');
  await card.click();
  await expect(card).toHaveAttribute('data-open', 'true');
  await expect(card).toContainText('trainers');
  await card.click();
  await expect(page.getByTestId('screen-journal')).toBeVisible();
  await expect(page.getByTestId('goal-d2.route')).toHaveClass(/done/);
  await expect(page.getByTestId('goal-d2.reach')).toHaveClass(/done/);
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('play-map')).toBeVisible();
});

test('icons behind the camera are hidden (looking away from the centre)', async ({ page }) => {
  await startDone(page);
  // ~500 m west of Kongens Have (icons further than 700 m are hidden in the fog)
  await teleport(page, { lat: 55.3998, lng: 10.3773 });
  await page.waitForTimeout(2500);
  const shown = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('.poi-marker')].filter(
          (e) => e.style.visibility !== 'hidden',
        ).length,
    );
  const face = (bearing: number) =>
    page.evaluate((b) => {
      (window as unknown as { __omlMap: { setBearing: (x: number) => void } }).__omlMap.setBearing(
        b,
      );
    }, bearing);
  await face(270); // west, away from the centre
  await expect.poll(shown, { timeout: 5000 }).toBe(0);
  await face(90); // east, towards it
  await expect.poll(shown, { timeout: 5000 }).toBeGreaterThan(0);
});

test('loading screen: finds the position, builds the town, then shows the map', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await page.evaluate(() =>
    (
      window as unknown as { __omlDev: { skipOnboarding: (s: string) => void } }
    ).__omlDev.skipOnboarding('gnistkat'),
  );
  const screen = page.getByTestId('loading-screen');
  await screen.waitFor({ state: 'attached', timeout: 15_000 });
  await expect(screen).toContainText('Finding your position');
  await expect(screen).toContainText('Building the town');
  // both steps get ticked off, then it fades away (well before the 20 s fallback)
  await expect(screen).toHaveCount(0, { timeout: 18_000 });
  await expect(page.getByTestId('journal-card')).toBeVisible();
});

type LayerMap = {
  getLayer: (id: string) => unknown;
  getLayoutProperty: (id: string, p: string) => unknown;
  getStyle: () => { layers: { id: string }[] };
};
const layers = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __omlMap: LayerMap }).__omlMap;
    const ids = m.getStyle().layers.map((l) => l.id);
    return {
      on3d:
        !!m.getLayer('buildings-3d') &&
        m.getLayoutProperty('buildings-3d', 'visibility') !== 'none',
      flat: m.getLayoutProperty('buildings', 'visibility') !== 'none',
      order: ['buildings-3d', 'place-labels', 'water-labels'].map((id) => ids.indexOf(id)),
    };
  });

test('3D buildings are opt-in (Settings), and facing labels stay above them', async ({ page }) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.waitForFunction(() =>
    (window as unknown as { __omlMap: { getLayer: (id: string) => unknown } }).__omlMap.getLayer(
      'buildings-3d',
    ),
  );
  let l = await layers(page);
  expect(l.on3d).toBe(false); // off by default
  expect(l.flat).toBe(true);
  // place and water names are drawn after (above) the buildings
  expect(l.order[1]).toBeGreaterThan(l.order[0]!);
  expect(l.order[2]).toBeGreaterThan(l.order[0]!);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.locator('[data-testid=setting-buildings3d] input').check();
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-map').click();
  await page.waitForFunction(() => '__omlMap' in window);
  await expect.poll(async () => (await layers(page)).on3d, { timeout: 10_000 }).toBe(true);
  l = await layers(page);
  expect(l.flat).toBe(false);
  // buildings load and unload 100 m behind the fog wall (2,000 m by default)
  const filter = () =>
    page.evaluate(() =>
      JSON.stringify(
        (
          window as unknown as { __omlMap: { getFilter: (id: string) => unknown } }
        ).__omlMap.getFilter('buildings-3d'),
      ),
    );
  expect(await filter()).toContain('"distance"');
  expect(await filter()).toContain('2100');
  // the fog distance slider (1–2 km) moves the wall and the buildings with it, at once
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.locator('[data-testid=setting-fogDistance] input').fill('1000');
  await expect(page.getByTestId('setting-fogDistance')).toContainText('1.0 km');
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-map').click();
  await expect.poll(filter, { timeout: 10_000 }).toContain('1100');
});

test('HUD on demand: the Nearby strip opens from a button; no text banner while searching', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await dev(page, 'injectSpawn', { speciesId: 'torvdue', district: 1, lat: 55.3995, lng: 10.3856 });
  await expect(page.getByTestId('nearby-count')).toHaveCount(0); // closed by default
  const btn = page.getByTestId('nearby-button');
  await expect(btn).toContainText('1');
  await btn.click();
  await expect(page.getByTestId('nearby-chip')).toHaveCount(1);
  await btn.click();
  await expect(page.getByTestId('nearby-count')).toHaveCount(0);
  // no "looking for creatures" banner, and a good GPS fix shows no signal warning
  await expect(page.getByText('Looking for creatures')).toHaveCount(0);
  await expect(page.getByTestId('gps-signal')).toHaveCount(0);
  // the goal card starts folded
  await expect(page.getByTestId('journal-card')).toHaveAttribute('data-open', 'false');
  // a drag on the map never scrolls the page or pulls to reload
  const touch = await page.evaluate(() => ({
    canvas: getComputedStyle(document.querySelector('.maplibregl-canvas-container')!).touchAction,
    html: getComputedStyle(document.documentElement).overscrollBehaviorY,
  }));
  expect(touch).toEqual({ canvas: 'none', html: 'none' });
});

test('a finger drag rotates like a mouse drag, and never reloads the page', async ({
  page,
  context,
}) => {
  await startDone(page);
  await teleport(page, { lat: 55.3975, lng: 10.3905 });
  await page.waitForTimeout(2500);
  const bearing = () =>
    page.evaluate(() =>
      (window as unknown as { __omlMap: { getBearing: () => number } }).__omlMap.getBearing(),
    );
  await page.evaluate(() => {
    (window as unknown as { __mark: number }).__mark = 1;
  });
  const b0 = await bearing();
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, pt: [number, number] | null) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: pt ? [{ x: pt[0], y: pt[1], id: 1 }] : [],
    });
  // one finger along the bottom of the screen, then a pull downwards (pull-to-reload gesture)
  await touch('touchStart', [40, 620]);
  for (let i = 1; i <= 30; i++) {
    await touch('touchMove', [40 + i * 10, 620]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', null);
  await touch('touchStart', [195, 200]);
  for (let i = 1; i <= 20; i++) {
    await touch('touchMove', [195, 200 + i * 20]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', null);
  await page.waitForTimeout(800);
  // still the same page (no reload) and the map turned like the mouse test does
  expect(await page.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(1);
  const turned = Math.abs((((await bearing()) - b0 + 540) % 360) - 180);
  expect(turned).toBeGreaterThan(25);
});

test('opening and closing the menu keeps the map alive (no reload of position or buildings)', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.waitForFunction(() =>
    (window as unknown as { __omlMap: { getLayer: (id: string) => unknown } }).__omlMap.getLayer(
      'buildings-3d',
    ),
  );
  await page.evaluate(() => {
    (window as unknown as { __omlMap: { __tag?: number } }).__omlMap.__tag = 7;
  });
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('menu-button').click();
    await page.getByTestId('menu-team').click();
    await page.getByTestId('screen-back').click();
    await page.getByTestId('menu-map').click();
  }
  // the very same map object, and no loading screen
  expect(
    await page.evaluate(
      () => (window as unknown as { __omlMap: { __tag?: number } }).__omlMap.__tag,
    ),
  ).toBe(7);
  await expect(page.getByTestId('loading-screen')).toHaveCount(0);
  await expect(page.getByTestId('journal-card')).toBeVisible();
});
