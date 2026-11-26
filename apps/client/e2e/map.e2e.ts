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
const allRoutes = (
  JSON.parse(
    readFileSync(
      new URL('../../../packages/data/content/odense/routes.json', import.meta.url),
      'utf8',
    ),
  ) as RouteJson
).routes;
const route1 = allRoutes.find((r) => r.id === 'route1')!;
const ROUTE_COUNT = allRoutes.length;

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

/**
 * Presses a POI stamp until `done` holds: right after a teleport the player counts as moving
 * fast, and a press then only says so (nothing happens above 25 km/h).
 */
async function pressUntil(page: Page, poiId: string, done: () => Promise<boolean>) {
  for (let i = 0; i < 60; i++) {
    await page.getByTestId(`poi-stamp-${poiId}`).evaluate((e) => (e as HTMLElement).click());
    for (let k = 0; k < 4; k++) {
      if (await done()) return;
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`pressing ${poiId} never worked`);
}

async function startDone(page: Page) {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  // the tester welcome (D176) was seen on an earlier launch
  await page.addInitScript(() => localStorage.setItem('oml.welcome.v1', '1'));
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

test('fog wall: the ground reaches just past it at every zoom, the sky is behind the map, the player sits lower zoomed in', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  type Tr = {
    modelViewProjectionMatrix: ArrayLike<number>;
    project: (c: unknown) => { x: number; y: number };
  };
  const look = (zoom: number) =>
    page.evaluate((zoom) => {
      const map = (
        window as unknown as {
          __omlMap: {
            jumpTo: (o: unknown) => void;
            project: (c: unknown) => { x: number; y: number };
            getCenter: () => { lat: number; lng: number };
            getContainer: () => HTMLElement;
            transform: unknown;
          };
        }
      ).__omlMap;
      map.jumpTo({ zoom, bearing: 0 });
      const tr = map.transform as Tr;
      const c = map.getCenter();
      // is a point this many metres north of the player inside MapLibre's far plane?
      const drawn = (m: number) => {
        const w = tr.project({ lat: c.lat + m / 111_320, lng: c.lng });
        const M = tr.modelViewProjectionMatrix;
        const z = M[2]! * w.x + M[6]! * w.y + M[14]!;
        const ww = M[3]! * w.x + M[7]! * w.y + M[15]!;
        return ww > 0 && z / ww < 1;
      };
      // above the top of the screen: not in view, so not drawn anyway
      const offTop = (m: number) => map.project({ lat: c.lat + m / 111_320, lng: c.lng }).y < 0;
      return {
        playerY: map.project(c).y / map.getContainer().clientHeight,
        at1220: drawn(1220),
        at1220OffTop: offTop(1220),
        at1400: drawn(1400),
        sky: map.getContainer().style.background,
      };
    }, zoom);
  const out = await look(16.5);
  const mid = await look(17.5);
  const inn = await look(18.5);
  // look-ahead: the player moves down the screen as you zoom in (60% of the way down)
  expect(out.playerY).toBeLessThan(0.47);
  expect(mid.playerY).toBeGreaterThan(out.playerY + 0.03);
  expect(inn.playerY).toBeGreaterThan(0.58);
  // the ground is drawn to just past the 1.2 km wall (50 m), or to the top of the screen
  // when that is nearer, and nothing beyond (before, zoomed in, MapLibre stopped ~850 m ahead)
  for (const v of [out, mid]) expect(v.at1220 || v.at1220OffTop).toBe(true);
  expect(inn.at1220).toBe(true);
  for (const v of [out, mid, inn]) expect(v.at1400).toBe(false);
  // the sky wall (the edge of the world and the sky) is a layer in the 3D scene, above every
  // other layer (buildings in front of it stay in front); behind the map is just the sky
  // colour (never seen)
  const top = await page.evaluate(() => {
    const ids = (
      window as unknown as { __omlMap: { getLayersOrder: () => string[] } }
    ).__omlMap.getLayersOrder();
    return ids[ids.length - 1];
  });
  expect(top).toBe('sky-wall');
  await expect.poll(async () => (await look(18.5)).sky).toMatch(/^rgb\(/);
});

test('Town Map: zones, arenas and routes; a card tells what a place needs (P22)', async ({
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
  await expect(page.locator('[data-testid^=tm-route-]')).toHaveCount(ROUTE_COUNT);
  await expect(page.getByTestId('tm-player')).toHaveCount(1);
  await expect(page.getByTestId('tm-target')).toHaveCount(1);
  // arena 2's zone is not open yet: the card says to walk a route there
  await page.getByTestId('tm-arena-2').evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId('townmap-needs')).toContainText('Walk a route to');
  await expect(page.getByTestId('townmap-distance')).toContainText('straight line');
  await page.getByTestId('tm-route-route1').evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId('townmap-card')).toContainText('Route 1');
  await expect(page.getByTestId('townmap-card')).toContainText('Leads to');
  await expect(page.getByTestId('townmap-needs')).toContainText(/\d+% walked of/);
  // the Town Map can't be dragged out of Odense Kommune
  const bounds = await page.evaluate(() =>
    (
      window as unknown as { __omlTownMap: { getMaxBounds: () => { toArray: () => number[][] } } }
    ).__omlTownMap
      .getMaxBounds()
      .toArray(),
  );
  expect(bounds[0]![0]).toBeGreaterThan(10.1);
  expect(bounds[1]![0]).toBeLessThan(10.7);
  await page.getByTestId('townmap-close').click();
  await expect(page.getByTestId('town-map')).toHaveCount(0);
});

test('Fyn map: the regions of Fyn, Odense and Svendborg open; badges grey until won; held on Fyn', async ({
  page,
}) => {
  await startDone(page);
  await dev(page, 'setBadges', [1]);
  await page.getByTestId('townmap-button').click();
  await page.getByTestId('townmap-fyn').click();
  await expect(page.getByTestId('fyn-map')).toBeVisible();
  await page.waitForFunction(() => '__omlFynMap' in window);
  await expect(page.getByTestId('fyn-hint')).toContainText('Odense');
  const badges = page.locator('[data-testid=fyn-badges-odense] img');
  await expect(badges).toHaveCount(8);
  await expect(page.locator('[data-testid=fyn-badges-odense] img.locked')).toHaveCount(7);
  const view = await page.evaluate(() => {
    const m = (
      window as unknown as {
        __omlFynMap: {
          getMaxBounds: () => { toArray: () => number[][] };
          getMinZoom: () => number;
          getMaxZoom: () => number;
          loaded: () => boolean;
        };
      }
    ).__omlFynMap;
    return { bounds: m.getMaxBounds().toArray(), min: m.getMinZoom(), max: m.getMaxZoom() };
  });
  // held on Fyn (not the rest of Denmark), with a narrow zoom range
  expect(view.bounds[0]![0]).toBeGreaterThan(9.3);
  expect(view.bounds[1]![0]).toBeLessThan(11.3);
  expect(view.bounds[0]![1]).toBeGreaterThan(53.8);
  expect(view.bounds[1]![1]).toBeLessThan(56.6);
  // the whole of Fyn is in view on opening (Middelfart in the west to Nyborg in the east)
  const seen = await page.evaluate(() =>
    (
      window as unknown as { __omlFynMap: { getBounds: () => { toArray: () => number[][] } } }
    ).__omlFynMap
      .getBounds()
      .toArray(),
  );
  expect(seen[0]![0]).toBeLessThanOrEqual(9.66);
  expect(seen[1]![0]).toBeGreaterThanOrEqual(10.95);
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const m = (
            window as unknown as {
              __omlFynMap: { getMinZoom: () => number; getMaxZoom: () => number };
            }
          ).__omlFynMap;
          return m.getMaxZoom() - m.getMinZoom();
        }),
    )
    .toBeLessThanOrEqual(1.7);
  expect(view.max).toBeGreaterThanOrEqual(view.min);
  // the Odense badges open the region: back to the Town Map
  await page.getByTestId('fyn-badges-odense').click();
  await expect(page.getByTestId('fyn-map')).toHaveCount(0);
  await expect(page.getByTestId('town-map')).toBeVisible();
  // another playable region opens its own Town Map to look at (owner request): its own
  // arenas, no progress before the first visit, no player; it changes nothing
  await page.getByTestId('townmap-fyn').click();
  await page.getByTestId('fyn-badges-svendborg').click();
  await expect(page.getByTestId('fyn-map')).toHaveCount(0);
  await expect(page.getByTestId('town-map')).toHaveAttribute('data-region', 'svendborg');
  await page.waitForFunction(() => '__omlTownMap' in window);
  const centre = await page.evaluate(() =>
    (
      window as unknown as { __omlTownMap: { getCenter: () => { lat: number } } }
    ).__omlTownMap.getCenter(),
  );
  expect(centre.lat).toBeLessThan(55.2);
  await expect(page.getByTestId('tm-arena-1')).not.toHaveClass(/won/);
  await expect(page.getByTestId('tm-player')).toHaveCount(0);
  await page.getByTestId('tm-arena-1').click();
  await expect(page.getByTestId('townmap-card')).toContainText('Frederiksø');
  // the top bar's badges button opens the badges of the region the map shows
  await page.getByTestId('townmap-badges').click();
  await expect(page.locator('.badge-grid')).toHaveAttribute('data-region', 'svendborg');
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('screen-badges')).toHaveCount(0);
  expect(await dev(page, 'save').then((x) => (x as { region: string }).region)).toBe('odense');
  await page.getByTestId('townmap-fyn').click();
  await page.getByTestId('fyn-badges-odense').click();
  await expect(page.getByTestId('town-map')).toHaveAttribute('data-region', 'odense');
  await expect(page.getByTestId('tm-arena-1')).toHaveClass(/won/);
  await expect(page.getByTestId('tm-player')).toHaveCount(1);
  // the close button also returns to the Town Map, which closes to the game view
  await page.getByTestId('townmap-fyn').click();
  await page.getByTestId('fynmap-close').click();
  await expect(page.getByTestId('fyn-map')).toHaveCount(0);
  await page.getByTestId('townmap-close').click();
  await expect(page.getByTestId('play-map')).toBeVisible();
});

test('POI stamps are pressable (owner): in reach a rest stop heals and a trainer battles; out of reach it says how far', async ({
  page,
}) => {
  await startDone(page);
  const pois = (
    JSON.parse(
      readFileSync(
        new URL('../../../packages/data/content/odense/pois.json', import.meta.url),
        'utf8',
      ),
    ) as { pois: { id: string; lat: number; lng: number; radius: number }[] }
  ).pois;
  const rest = pois.find((p) => p.id === 'rest_library')!;
  const lise = pois.find((p) => p.id === 'trainer_lise')!;
  // far away: a tap says how far to walk
  await teleport(page, { lat: rest.lat + 0.004, lng: rest.lng });
  await pressUntil(page, 'rest_library', async () =>
    (
      (await page
        .locator('.map-toast')
        .textContent()
        .catch(() => '')) ?? ''
    ).includes('m away'),
  );
  // 10 m outside the 40 m radius still counts (GPS slack), and the tap heals at once
  await dev(page, 'setTeamHp', 1);
  await teleport(page, { lat: rest.lat + 50 / 110_540, lng: rest.lng });
  await pressUntil(
    page,
    'rest_library',
    async () => ((await dev(page, 'save')) as { team: { hp: number }[] }).team[0]!.hp > 1,
  );
  // a trainer in reach: the tap starts the battle
  await teleport(page, lise);
  await pressUntil(page, 'trainer_lise', () => page.locator('main.battle').isVisible());
});

test('Market (D165): buy with skilling, sell back for half; back returns to the map', async ({
  page,
}) => {
  await startDone(page);
  await dev(page, 'addCoins', 300);
  const market = (
    JSON.parse(
      readFileSync(
        new URL('../../../packages/data/content/odense/pois.json', import.meta.url),
        'utf8',
      ),
    ) as { pois: { id: string; lat: number; lng: number }[] }
  ).pois.find((p) => p.id === 'market_vestergade')!;
  await teleport(page, market);
  // no card pops up by itself; pressing the market's stamp opens the market
  await expect(page.locator('[data-testid=poi-card]')).toHaveCount(0);
  await pressUntil(page, 'market_vestergade', () => page.getByTestId('screen-market').isVisible());
  await expect(page.getByTestId('market-coins')).toContainText('300');
  // Good Charms wait for badge 2
  await expect(page.getByTestId('buy-good_charm')).toBeDisabled();
  await page.getByTestId('buy-basic_charm').click();
  await expect(page.getByTestId('market-coins')).toContainText('200');
  await page.getByTestId('tab-sell').click();
  await page.getByTestId('sell-basic_charm').click();
  await expect(page.getByTestId('market-coins')).toContainText('250');
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('play-map')).toBeVisible();
});

test('Town Map (D165): destinations, markets and trainers as stamps; the filter hides kinds and is remembered', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.getByTestId('townmap-button').click();
  await page.waitForFunction(() => '__omlTownMap' in window);
  await expect(page.locator('[data-testid^=tm-zone-]').first()).toBeAttached();
  await expect(page.getByTestId('tm-zone-elmelund')).toHaveCount(1);
  await expect(page.locator('[data-testid^=tm-market-]')).toHaveCount(9);
  await expect(page.locator('[data-testid^=tm-trainer-]').first()).toBeAttached();
  await page.getByTestId('tm-zone-munkemose').evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId('townmap-needs')).toContainText('Lake');
  // the filter: one button in the top bar, a short menu of switches
  await page.getByTestId('townmap-filter').click();
  await expect(page.getByTestId('townmap-filter-menu')).toBeVisible();
  await page.locator('[data-testid=filter-trainers] input').uncheck();
  await expect(page.getByTestId('town-map')).toHaveClass(/hide-trainers/);
  // every icon shows at every zoom (owner request): only the filter hides kinds
  const zoomTo = (z: number) =>
    page.evaluate((zz) => {
      (
        window as unknown as { __omlTownMap: { jumpTo: (o: { zoom: number }) => void } }
      ).__omlTownMap.jumpTo({ zoom: zz });
    }, z);
  await zoomTo(10.3);
  await expect(page.locator('[data-testid^=tm-rest-]').first()).toBeVisible();
  await expect(page.locator('[data-testid^=tm-route-]').first()).toBeVisible();
  await zoomTo(13);
  const vis = (layer: string) =>
    page.evaluate(
      (l) =>
        (
          window as unknown as {
            __omlTownMap: { getLayoutProperty: (l: string, p: string) => string };
          }
        ).__omlTownMap.getLayoutProperty(l, 'visibility'),
      layer,
    );
  // route labels (numbers and names) have their own switch, under routes
  await page.locator('[data-testid=filter-routeLabels] input').uncheck();
  await expect(page.getByTestId('town-map')).toHaveClass(/hide-routeLabels/);
  await expect(page.locator('[data-testid^=tm-route-]').first()).toBeHidden();
  expect(await vis('route-labels')).toBe('none');
  expect(await vis('routes')).toBe('visible');
  await page.locator('[data-testid=filter-routeLabels] input').check();
  await expect(page.locator('[data-testid^=tm-route-]').first()).toBeVisible();
  // hiding the routes hides their labels too and greys out the labels switch
  await page.locator('[data-testid=filter-routes] input').uncheck();
  expect(await vis('routes')).toBe('none');
  expect(await vis('route-labels')).toBe('none');
  await expect(page.locator('[data-testid^=tm-route-]').first()).toBeHidden();
  await expect(page.getByTestId('filter-routeLabels')).toHaveClass(/disabled/);
  await expect(page.locator('[data-testid=filter-routeLabels] input')).toBeDisabled();
  await page.getByTestId('townmap-close').click();
  await page.getByTestId('townmap-button').click();
  await expect(page.getByTestId('town-map')).toHaveClass(/hide-trainers/);
  await expect(page.getByTestId('town-map')).toHaveClass(/hide-routes/);
});

test('Journal: walking Route 1 with the GPS simulator fills it and opens Næsbyhoved', async ({
  page,
}) => {
  await startDone(page);
  await dev(page, 'setBadges', [1]);
  await teleport(page, KONGENS_HAVE);
  const card = page.getByTestId('journal-card');
  await expect(card).toHaveAttribute('data-guide', 'd2.route');
  // walk the route, a step every 15 m
  for (const p of along(route1.path)) {
    await teleport(page, p);
    await page.waitForTimeout(120);
  }
  await expect
    .poll(async () => {
      const s = (await dev(page, 'save')) as { zones: string[] };
      return s.zones;
    })
    .toContain('naesbyhoved');
  // the route is done: the card moves on to the district's trainers
  await expect(card).toHaveAttribute('data-guide', 'd2.trainers');
  // the goal card starts folded: the first tap opens it, the next opens the Journal
  await expect(card).toHaveAttribute('data-open', 'false');
  await card.click();
  await expect(card).toHaveAttribute('data-open', 'true');
  await expect(card).toContainText('trainers');
  await card.click();
  await expect(page.getByTestId('screen-journal')).toBeVisible();
  await expect(page.getByTestId('goal-d2.route')).toHaveClass(/done/);
  await expect(page.getByTestId('journal-region')).toContainText('Routes walked: 1 of');
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('play-map')).toBeVisible();
});

test('icons behind the camera are hidden (looking away from the centre)', async ({ page }) => {
  await startDone(page);
  // west of the old town; the POIs counted are the ones east of the player (route trainers
  // stand all around since D163, so "nothing visible" no longer holds anywhere)
  const here = { lat: 55.394, lng: 10.3773 };
  await teleport(page, here);
  await page.waitForTimeout(2500);
  const shown = () =>
    page.evaluate(
      (lng) =>
        [...document.querySelectorAll<HTMLElement>('.poi-marker')].filter(
          (e) => e.style.visibility !== 'hidden' && Number(e.dataset.lng) > lng + 0.002,
        ).length,
      here.lng,
    );
  const face = (bearing: number) =>
    page.evaluate((b) => {
      (window as unknown as { __omlMap: { setBearing: (x: number) => void } }).__omlMap.setBearing(
        b,
      );
    }, bearing);
  await face(270); // west: the POIs to the east are behind the camera
  await expect.poll(shown, { timeout: 5000 }).toBe(0);
  await face(90); // east, towards them
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
  // buildings load and unload at the edge of the world (1,200 m by default)
  const filter = () =>
    page.evaluate(() =>
      JSON.stringify(
        (
          window as unknown as { __omlMap: { getFilter: (id: string) => unknown } }
        ).__omlMap.getFilter('buildings-3d'),
      ),
    );
  expect(await filter()).toContain('"distance"');
  expect(await filter()).toContain(',1200]');
  // the fog distance slider (1–2 km) moves the wall and the buildings with it, at once
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.locator('[data-testid=setting-fogDistance] input').fill('1000');
  await expect(page.getByTestId('setting-fogDistance')).toContainText('1.0 km');
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-map').click();
  await expect.poll(filter, { timeout: 10_000 }).toContain(',1000]');
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

test('Settings lead to the battle playtest, and the playtest back to the map game', async ({
  page,
}) => {
  await startDone(page);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('to-playtest').click();
  await expect(page).toHaveURL(/#\/playtest$/);
  await expect(page.getByTestId('logo')).toBeVisible();
  await page.getByTestId('to-map').click();
  await expect(page).toHaveURL(/#\/$/);
  // the saved game is still there: straight to the map, no onboarding
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await expect(page.getByTestId('onboarding-safety')).toHaveCount(0);
});

test('a pinch zooms even while the player glides to a new GPS fix (no reset by re-centring)', async ({
  page,
  context,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.waitForTimeout(2500);
  const zoom = () =>
    page.evaluate(() =>
      (window as unknown as { __omlMap: { getZoom: () => number } }).__omlMap.getZoom(),
    );
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, pts: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })),
    });
  for (let attempt = 0; attempt < 3; attempt++) {
    const z0 = await zoom();
    // a new fix ~150 m away: the figure glides there and the camera follows it, frame by frame
    await teleport(page, {
      lat: KONGENS_HAVE.lat + (attempt % 2 ? -0.0014 : 0.0014),
      lng: KONGENS_HAVE.lng,
    });
    await page.waitForTimeout(50);
    // two fingers land and spread slowly (below MapLibre's zoom threshold at first)
    await touch('touchStart', [
      [175, 400],
      [215, 400],
    ]);
    for (let i = 1; i <= 25; i++) {
      await touch('touchMove', [
        [175 - i * 4, 400],
        [215 + i * 4, 400],
      ]);
      await page.waitForTimeout(30);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(500);
    const z1 = await zoom();
    expect(z1, `attempt ${attempt}`).toBeGreaterThan(Math.min(z0 + 0.4, 18.4));
    // back out for the next attempt
    await page.evaluate(() => {
      (window as unknown as { __omlMap: { setZoom: (z: number) => void } }).__omlMap.setZoom(17);
    });
    await page.waitForTimeout(300);
  }
});

test("the phone's top bar has the menu's paper colour, on the map and on menus", async ({
  page,
}) => {
  await startDone(page);
  const bar = () => page.locator('meta[name="theme-color"]').getAttribute('content');
  const paper = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
  );
  // cream by day, navy at night (whichever is on now)
  expect(paper).toMatch(/^#(f5ecd7|1b2130)$/);
  await expect.poll(bar).toBe(paper);
  await page.getByTestId('menu-button').click();
  // the menu's header is exactly that colour, so it seems to fill the screen
  const head = await page
    .locator('.screen-top')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const hex = (c: string) =>
    '#' +
    (c.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((n) => (+n).toString(16).padStart(2, '0'))
      .join('');
  expect(hex(head)).toBe(paper);
  await expect.poll(bar).toBe(paper);
});

test('map credits start closed, open and close on tap, and lie above the game buttons', async ({
  page,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  const credits = (root: string) => page.locator(`${root} .maplibregl-ctrl-attrib`);
  const open = (root: string) =>
    credits(root).evaluate((el) => el.classList.contains('maplibregl-compact-show'));
  const text = (root: string) => page.locator(`${root} .maplibregl-ctrl-attrib-inner`);
  // play view: closed at start
  await page.waitForTimeout(1500); // the credits text arrives with the map data
  expect(await open('.map-screen')).toBe(false);
  await expect(text('.map-screen')).toBeHidden();
  // nothing covers the button: a tap on its centre reaches it
  const button = page.locator('.map-screen .maplibregl-ctrl-attrib-button');
  const box = (await button.boundingBox())!;
  const hit = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.maplibregl-ctrl-attrib'),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);
  await button.click();
  await expect(text('.map-screen')).toBeVisible();
  await expect(text('.map-screen')).toContainText('OpenStreetMap');
  // open, the credits lie on top of the satchel button where they overlap
  const sb = (await page.getByTestId('menu-button').boundingBox())!;
  const tb = (await text('.map-screen').boundingBox())!;
  if (tb.x < sb.x + sb.width && tb.y + tb.height > sb.y) {
    const y = Math.max(tb.y, sb.y) + 2;
    const x = Math.max(tb.x, sb.x) + 2;
    const onTop = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.maplibregl-ctrl-attrib'),
      { x, y },
    );
    expect(onTop).toBe(true);
  }
  await button.click();
  await expect(text('.map-screen')).toBeHidden();
  // they prefer to be closed: open, then a touch anywhere else folds them away
  await button.click();
  await expect(text('.map-screen')).toBeVisible();
  await page.mouse.click(195, 420);
  await expect(text('.map-screen')).toBeHidden();
  // Town Map: closed at start too
  await page.getByTestId('townmap-button').click();
  await expect(page.getByTestId('town-map')).toBeVisible();
  await page.waitForFunction(() => '__omlTownMap' in window);
  await page.waitForTimeout(1000);
  expect(await open('.town-map')).toBe(false);
  await expect(text('.town-map')).toBeHidden();
  await page.locator('.town-map .maplibregl-ctrl-attrib-button').click();
  await expect(text('.town-map')).toBeVisible();
});

test('Settings → Test items gives a Revive Blossom; the bag uses it to revive with full HP', async ({
  page,
}) => {
  await startDone(page);
  type Dev = {
    setTeamHp: (hp: number) => void;
    save: () => { team: { uid: string; hp: number }[]; bag: Record<string, number> } | null;
  };
  const dev = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __omlDev: Dev }).__omlDev.save()!;
      return { team: s.team, bag: s.bag };
    });
  await page.evaluate(() => {
    (window as unknown as { __omlDev: Dev }).__omlDev.setTeamHp(0);
  });
  await expect.poll(async () => (await dev()).team[0]!.hp).toBe(0);
  const uid = (await dev()).team[0]!.uid;
  // Settings: below the safety reminder, above the walk test
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  const order = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-testid="setting-safety"], [data-testid="setting-test-items"], [data-testid="setting-mode"], [data-testid="gate3-panel"]',
      ),
    ].map((e) => e.getAttribute('data-testid')),
  );
  // the battle playtest sits above the walk test
  expect(order).toEqual(['setting-safety', 'setting-test-items', 'setting-mode', 'gate3-panel']);
  await page.getByTestId('get-revive_blossom').click();
  await expect(page.getByTestId('test-items-msg')).toContainText('Revive Blossom');
  expect((await dev()).bag.revive_blossom).toBe(1);
  // charms and tonics too, so testing doesn't stall on running out
  const before = (await dev()).bag;
  await page.getByTestId('get-basic_charm').click();
  await page.getByTestId('get-small_tonic').click();
  await expect.poll(async () => (await dev()).bag.basic_charm).toBe((before.basic_charm ?? 0) + 1);
  expect((await dev()).bag.small_tonic).toBe((before.small_tonic ?? 0) + 1);
  // the bag: like a tonic, choose the creature; it comes back with full HP
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-bag').click();
  await page.getByTestId('bag-revive_blossom').click();
  await page.getByTestId(`use-on-${uid}`).click();
  await expect.poll(async () => (await dev()).team[0]!.hp).toBeGreaterThan(0);
  const after = await page.evaluate(() => {
    const s = (window as unknown as { __omlDev: Dev }).__omlDev.save()!;
    return s.team[0]!.hp;
  });
  // revived (the exact full-HP amount is checked by the game's unit test)
  expect(after).toBeGreaterThan(1);
  expect((await dev()).bag.revive_blossom ?? 0).toBe(0);
});

test('the loading screen shows when the map game opens from the battle test (a new map and GPS search)', async ({
  page,
}) => {
  await startDone(page);
  // map → battle test → map: a new map and a new GPS search, so the loading screen shows
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('to-playtest').click();
  await expect(page).toHaveURL(/#\/playtest$/);
  await page.getByTestId('to-map').click();
  await expect(page.getByTestId('loading-screen')).toBeVisible();
  await expect(page.getByTestId('loading-screen')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('40 m range ring, see-through icons beyond it, names in Nearby, the camera faces a chosen creature', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __vibrations: unknown[] }).__vibrations = calls;
    (navigator as unknown as { vibrate: (p: unknown) => boolean }).vibrate = (p) => (
      calls.push(p),
      true
    );
  });
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.waitForTimeout(1500);
  // a first interaction (phones only vibrate after one); a key, since a tap on the map
  // could land on a POI stamp, which now acts (press-based POIs)
  await page.keyboard.press('KeyA');
  // no heading cone on the player
  await expect(page.locator('.heading-marker')).toHaveCount(0);
  // the ring around the player is the 40 m battle range (not the GPS accuracy)
  const ringM = await page.evaluate(() => {
    const m = (
      window as unknown as {
        __omlMap: {
          getSource: (id: string) => { serialize: () => { data: GeoJSON.FeatureCollection } };
          getCenter: () => { lat: number; lng: number };
        };
      }
    ).__omlMap;
    const ring = m.getSource('player').serialize().data.features[0]!.geometry as GeoJSON.Polygon;
    const [lng, lat] = ring.coordinates[0]![0]!;
    const c = m.getCenter();
    const dy = (lat! - c.lat) * 111_320;
    const dx = (lng! - c.lng) * 111_320 * Math.cos((c.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  });
  expect(ringM).toBeGreaterThan(38);
  expect(ringM).toBeLessThan(42);
  // one creature within 40 m, one beyond it to the east
  const near = (await dev(page, 'injectSpawn', {
    speciesId: 'torvdue',
    district: 1,
    lat: KONGENS_HAVE.lat + 0.0002,
    lng: KONGENS_HAVE.lng,
  })) as string;
  const far = (await dev(page, 'injectSpawn', {
    speciesId: 'rendsnude',
    district: 1,
    lat: KONGENS_HAVE.lat,
    lng: KONGENS_HAVE.lng + 0.0016,
  })) as string;
  const marker = (id: string) => page.locator(`.spawn-marker[data-spawn-id="${id}"]`);
  await expect(marker(near)).toHaveClass(/in-range/);
  await expect(marker(far)).toHaveClass(/out-of-range/);
  const opacity = (id: string) =>
    marker(id)
      .locator('.marker-body')
      .evaluate((el) => +getComputedStyle(el).opacity);
  await expect.poll(() => opacity(near)).toBe(1);
  await expect.poll(() => opacity(far)).toBeLessThan(1);
  // coming within range vibrates; no "is close" message any more
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations.length),
    )
    .toBeGreaterThan(0);
  await expect(page.getByText(/is close/)).toHaveCount(0);
  // Nearby: names instead of distances, and no "tap to battle" text
  await page.getByTestId('nearby-button').click();
  const chip = (id: string) => page.locator(`[data-testid="nearby-chip"][data-spawn="${id}"]`);
  await expect(chip(near)).toContainText('Torvdue');
  await expect(chip(far)).toContainText('Rendsnude');
  await expect(page.getByTestId('nearby-count')).not.toContainText(/\d+ m\b/);
  await expect(page.getByText('Tap to battle')).toHaveCount(0);
  // choosing a creature turns the camera so it lies straight ahead (east here: ~90°)
  await chip(far).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __omlMap: { getBearing: () => number } }).__omlMap.getBearing(),
      ),
    )
    .toBeGreaterThan(85);
  const b = await page.evaluate(() =>
    (window as unknown as { __omlMap: { getBearing: () => number } }).__omlMap.getBearing(),
  );
  expect(b).toBeLessThan(95);
  // choosing another: the first just stops bouncing (no pop-in replay from nothing)
  await chip(near).click();
  await expect(marker(near)).toHaveClass(/selected/);
  await expect(marker(far)).not.toHaveClass(/selected/);
  const anim = await marker(far)
    .locator('.marker-body')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
});

for (const mode of ['browser', 'installed app'] as const)
  test(`back gesture (${mode}): menus go back a level, the Town Map closes, the game view asks`, async ({
    page,
  }) => {
    if (mode === 'installed app')
      await page.addInitScript(() => localStorage.setItem('oml.e2e.installed', '1'));
    await startDone(page);
    await page.mouse.click(195, 300); // arms the guard (needs a first tap)
    const back = async () => {
      if (mode === 'installed app') await page.keyboard.press('Escape');
      else await page.goBack({ timeout: 2000 }).catch(() => null);
      await page.waitForTimeout(200);
    };
    const leave = page.getByTestId('leave-guard');
    // the satchel menu → team; back → menu; back → game view
    await page.getByTestId('menu-button').click();
    await page.getByTestId('menu-team').click();
    await expect(page.getByTestId('screen-team')).toBeVisible();
    await back();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(leave).toHaveCount(0);
    await back();
    await expect(page.getByTestId('screen-menu')).toHaveCount(0);
    await expect(leave).toHaveCount(0);
    // the Town Map and the Fyn map on top of it (P22): back closes Fyn, then the Town Map
    await page.getByTestId('townmap-button').click();
    await expect(page.getByTestId('town-map')).toBeVisible();
    await page.getByTestId('townmap-fyn').click();
    await expect(page.getByTestId('fyn-map')).toBeVisible();
    await back();
    await expect(page.getByTestId('fyn-map')).toHaveCount(0);
    await expect(page.getByTestId('town-map')).toBeVisible();
    await expect(leave).toHaveCount(0);
    await back();
    await expect(page.getByTestId('town-map')).toHaveCount(0);
    await expect(leave).toHaveCount(0);
    // the game view with the Nearby strip open: back asks, and the strip stays
    await page.getByTestId('nearby-button').click();
    await back();
    await expect(leave).toBeVisible();
    await page.getByTestId('leave-stay').click();
    await expect(leave).toHaveCount(0);
    // after Stay it keeps working
    await back();
    await expect(leave).toBeVisible();
  });

test('Settings: Vibration has its own toggle under Sound; options with several choices are dropdowns', async ({
  page,
}) => {
  await startDone(page);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  // Vibration comes right after Sound, as a switch like it
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="screen-settings"] [data-testid^="setting-"]')].map(
      (e) => e.getAttribute('data-testid'),
    ),
  );
  expect(ids.indexOf('setting-vibration')).toBe(ids.indexOf('setting-sound') + 1);
  const vib = page.locator('[data-testid=setting-vibration] input[role=switch]');
  await expect(page.getByTestId('setting-vibration')).toContainText('Vibration');
  await expect(vib).toBeChecked();
  await vib.uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-vibration', 'off');
  // "reduce motion" no longer switches vibration off
  await vib.check();
  await page.locator('[data-testid=setting-reduceMotion] input').check();
  await expect(page.locator('html')).toHaveAttribute('data-vibration', 'on');
  await page.locator('[data-testid=setting-reduceMotion] input').uncheck();
  // battle speed, text size and language are dropdowns
  for (const id of ['speed', 'textSize', 'language'])
    await expect(page.locator(`[data-testid=setting-${id}] select`)).toHaveCount(1);
  await page.locator('[data-testid=setting-speed] select').selectOption('fast');
  await expect(page.locator('[data-testid=setting-speed] select')).toHaveValue('fast');
  await page.locator('[data-testid=setting-language] select').selectOption('da');
  await expect(page.getByTestId('setting-vibration')).toContainText('Vibration');
  await expect(page.getByTestId('setting-sound')).toContainText('Lyd');
  await page.locator('[data-testid=setting-language] select').selectOption('en');
  await expect(page.getByTestId('setting-sound')).toContainText('Sound');
});

test('Settings end with the credits line', async ({ page }) => {
  await startDone(page);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  const credits = page.getByTestId('settings-credits');
  await expect(credits).toHaveText('Developed by Christian Bröchner Rasmussen with Claude');
  // the very last thing on the screen
  const last = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="screen-settings"]')!;
    const all = [...screen.querySelectorAll('*')].filter((e) => e.getClientRects().length > 0);
    return all[all.length - 1]?.closest('[data-testid="settings-credits"]') !== null;
  });
  expect(last).toBe(true);
});

test('a steady player: GPS drift under 3 m is ignored, the figure holds still while a finger is down; the scan sweeps the range', async ({
  page,
  context,
}) => {
  await startDone(page);
  await teleport(page, KONGENS_HAVE);
  await page.waitForTimeout(1500);
  const centre = () =>
    page.evaluate(() => {
      const c = (
        window as unknown as { __omlMap: { getCenter: () => { lat: number; lng: number } } }
      ).__omlMap.getCenter();
      return { lat: c.lat, lng: c.lng };
    });
  const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.hypot((a.lat - b.lat) * 110_540, (a.lng - b.lng) * 63_000);
  // settled on Kongens Have first (the first glide there is long)
  await expect
    .poll(async () => metres(await centre(), KONGENS_HAVE), { timeout: 10_000 })
    .toBeLessThan(0.1);
  const c0 = await centre();
  // drift of ~1.5 m: the figure (and the camera on it) stays put
  await teleport(page, { lat: KONGENS_HAVE.lat + 1.5 / 110_540, lng: KONGENS_HAVE.lng });
  await page.waitForTimeout(1000);
  expect(metres(await centre(), c0)).toBeLessThan(0.1);
  // a real move of ~10 m is followed
  await teleport(page, { lat: KONGENS_HAVE.lat + 10 / 110_540, lng: KONGENS_HAVE.lng });
  const ten = { lat: KONGENS_HAVE.lat + 10 / 110_540, lng: KONGENS_HAVE.lng };
  await expect.poll(async () => metres(await centre(), ten), { timeout: 5000 }).toBeLessThan(0.1);
  // while a finger is on the map, a new fix doesn't move the figure (no shake while turning)
  const c1 = await centre();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 100, y: 400, id: 1 }], // on the map, clear of the HUD
  });
  await teleport(page, { lat: KONGENS_HAVE.lat + 30 / 110_540, lng: KONGENS_HAVE.lng });
  await page.waitForTimeout(800);
  expect(metres(await centre(), c1)).toBeLessThan(0.5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // let go: it glides on to the new fix
  await expect.poll(async () => metres(await centre(), c1), { timeout: 5000 }).toBeGreaterThan(19);
  // the scan: a path that changes as it sweeps
  const d = () => page.locator('.scan-ring path').getAttribute('d');
  await expect.poll(async () => ((await d()) ?? '').length).toBeGreaterThan(20);
  const d1 = await d();
  await page.waitForTimeout(300);
  expect(await d()).not.toBe(d1);
});
