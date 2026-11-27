import { expect, test, type Page } from '@playwright/test';

/**
 * Campaigns per region (P27): each region is its own game. Entering a new region starts its
 * own campaign at the starter choice, the old one waits, and coming back restores it. The
 * map, Town Map and ferry crossings are the campaign's own region.
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

type SaveLike = {
  region: string;
  badges: number[];
  coins: number;
  team: unknown[];
  onboarding: string;
  campaigns: Record<string, { badges: number[]; coins: number } | undefined>;
};
const save = (page: Page) => dev(page, 'save') as Promise<SaveLike>;

async function startDone(page: Page) {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.addInitScript(() => localStorage.setItem('oml.welcome.v1', '1'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await dev(page, 'skipOnboarding', 'gnistkat');
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 30_000 });
}

test('a new region is a new campaign; the old one waits and comes back intact', async ({
  page,
}) => {
  await startDone(page);
  await dev(page, 'setBadges', [1, 2]);
  await dev(page, 'addCoins', 75);
  const before = await save(page);
  expect(before.region).toBe('odense');

  await dev(page, 'enterRegion', 'svendborg');
  await expect(page.getByTestId('onboarding-starter')).toBeVisible();
  await expect(page.getByTestId('onboarding-new-region')).toContainText('Svendborg');
  const there = await save(page);
  expect(there.region).toBe('svendborg');
  expect(there.onboarding).toBe('starter');
  expect(there.badges).toEqual([]);
  expect(there.team).toEqual([]);
  expect(there.campaigns.odense?.badges).toEqual([1, 2]);
  expect(there.campaigns.odense?.coins).toBe(before.coins);

  // survives a reload (the save holds both campaigns)
  await page.reload();
  await expect(page.getByTestId('onboarding-starter')).toBeVisible();

  await dev(page, 'enterRegion', 'odense');
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 30_000 });
  await expect(page.getByTestId('play-map')).toBeVisible();
  const back = await save(page);
  expect(back.region).toBe('odense');
  expect(back.badges).toEqual([1, 2]);
  expect(back.coins).toBe(before.coins);
  expect(back.team).toHaveLength(1);
  expect(back.campaigns.odense).toBeUndefined();
  expect(back.campaigns.svendborg?.badges).toEqual([]);
});

test("Svendborg's own map: its tiles, frame, zones and the dotted ferry crossings", async ({
  page,
}) => {
  await startDone(page);
  // stand in Svendborg's harbour first: the campaign switches there by itself
  await page.evaluate(() =>
    (
      window as unknown as { __omlSim: { teleport: (p: { lat: number; lng: number }) => void } }
    ).__omlSim.teleport({ lat: 55.0595, lng: 10.6135 }),
  );
  await dev(page, 'enterRegion', 'svendborg');
  await expect(page.getByTestId('onboarding-starter')).toBeVisible();
  await dev(page, 'finishOnboarding');
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 30_000 });
  const play = await page.evaluate(() => {
    const m = (
      window as unknown as {
        __omlMap: {
          getMaxBounds: () => { toArray: () => number[][] };
          getStyle: () => { sources: Record<string, { url?: string }> };
          getLayer: (id: string) => unknown;
        };
      }
    ).__omlMap;
    return {
      bounds: m.getMaxBounds().toArray(),
      sources: JSON.stringify(m.getStyle().sources),
      ferry: !!m.getLayer('ferry-routes'),
    };
  });
  expect(play.sources).toContain('svendborg.pmtiles');
  expect(play.sources).not.toContain('odense.pmtiles');
  expect(play.bounds[0]![1]).toBeLessThan(55); // Svendborg's frame reaches south of 55°
  expect(play.ferry).toBe(true);
  expect((await save(page)).region).toBe('svendborg');

  await page.getByTestId('townmap-button').click();
  await expect(page.getByTestId('town-map')).toBeVisible();
  await page.waitForFunction(() => '__omlTownMap' in window);
  await expect(page.getByTestId('tm-route-svb_route46')).toHaveCount(1);
  await expect(page.locator('[data-testid^=tm-route-route]')).toHaveCount(0);
  await page.getByTestId('tm-route-svb_route46').evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId('town-map')).toContainText('Ferry crossing');
});

test.describe('location before the starter (owner: an iPhone tester had location off)', () => {
  test.use({ permissions: [] });
  test('waits for a position, explains a refusal, then gives the starters of where you are', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
    await page.addInitScript(() => localStorage.setItem('oml.welcome.v1', '1'));
    await page.goto('#/dev/map');
    await page.getByTestId('onboarding-safety').waitFor();
    await page.getByTestId('onboarding-next').click();
    // location not allowed: the game says so and stays on this step
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('location-problem')).toBeVisible();
    await expect(page.getByTestId('onboarding-location')).toHaveAttribute('data-state', 'denied');
    await expect(page.getByTestId('onboarding-starter')).toHaveCount(0);
    await expect(page.getByTestId('onboarding-next')).toHaveText('Try again');
    // allowed, standing in Svendborg: Svendborg's starters
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 55.0598, longitude: 10.6068 });
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-starter').waitFor();
    await expect(page.getByTestId('starter-svb_kridtling')).toBeVisible();
    expect((await save(page)).region).toBe('svendborg');
  });
});
