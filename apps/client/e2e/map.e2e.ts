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
  await tut.waitFor({ timeout: 30_000 });
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
  expect(cam.pitch).toBeCloseTo(67.5, 0); // halfway between 55 (zoomed out) and 80 (zoomed in)
  const jump = (o: Record<string, number>) =>
    page.evaluate(
      (x) =>
        (window as unknown as { __omlMap: { jumpTo: (o: unknown) => void } }).__omlMap.jumpTo(x),
      o,
    );
  // zoom limits, and the tilt follows the zoom
  await jump({ zoom: 20 });
  cam = await camera(page);
  expect(cam.zoom).toBeCloseTo(18.5, 1);
  expect(cam.pitch).toBeCloseTo(80, 0);
  await jump({ zoom: 13 });
  cam = await camera(page);
  expect(cam.zoom).toBeCloseTo(16.5, 1);
  expect(cam.pitch).toBeCloseTo(55, 0);
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
  // a long swipe from one side to the other, level with the player, rotates too
  const fig = (await page.getByTestId('player-marker').boundingBox())!;
  const y = fig.y + fig.height - 10;
  const b2 = await camera(page);
  await page.mouse.move(box.x + 15, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 15 + i * 30, y);
  await page.mouse.up();
  await page.waitForTimeout(700); // includes the fling
  const a2 = await camera(page);
  expect(Math.abs(((a2.bearing - b2.bearing + 540) % 360) - 180)).toBeGreaterThan(60);
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
  await page.waitForTimeout(150);
  const mid = await centreOffset();
  expect(mid).toBeGreaterThan(1); // still on its way (≈ 22 m in total)
  expect(mid).toBeLessThan(22);
  for (let i = 0; i < 5; i++) {
    const o = await figureOffset();
    expect(Math.hypot(o.dx, o.dy)).toBeLessThan(3); // camera on the figure, also mid-glide
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => centreOffset(), { timeout: 5000 }).toBeGreaterThan(20);
  await teleport(page, KONGENS_HAVE);
  await expect.poll(centreOffset, { timeout: 5000 }).toBeLessThan(0.5);
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
  await card.click();
  await expect(page.getByTestId('screen-journal')).toBeVisible();
  await expect(page.getByTestId('goal-d2.route')).toHaveClass(/done/);
  await expect(page.getByTestId('goal-d2.reach')).toHaveClass(/done/);
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('play-map')).toBeVisible();
});
