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
        };
      });
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
  await dev(page, 'injectSpawn', { speciesId: 'torvdue', district: 1, lat: 55.3995, lng: 10.3856 });
  await dev(page, 'injectSpawn', {
    speciesId: 'grimaelling',
    district: 1,
    lat: 55.3989,
    lng: 10.3846,
  });
  await page.getByTestId('tutorial-marker').waitFor({ timeout: 30_000 });
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
      expect(offsets.length).toBeGreaterThan(3);
      for (const o of offsets) expect(o.px, `marker ${o.id} at zoom ${m.zoom}`).toBeLessThan(4);
    }
  }
});
