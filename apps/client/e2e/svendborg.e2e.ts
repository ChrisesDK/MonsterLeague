import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Svendborg end to end (P27): a player with an Odense campaign walks into Svendborg, gets
 * Svendborg's own starters, plays arenas 1–8 in order (junior, leader, badge), beats a route
 * trainer, shops at a market, lands on a ferry island (it opens), and walks back to Odense,
 * whose campaign is unchanged. Dev hooks (#/dev/map only) open the zones and give a
 * level-100 team, as in arenas.e2e.ts; the leaders' balance is the sim's job.
 */

interface PoiJson {
  pois: { id: string; lat: number; lng: number; kind: string; zone: string; arena?: number }[];
}
const read = <T>(rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/data/${rel}`, import.meta.url), 'utf8')) as T;
const pois = read<PoiJson>('content/svendborg/pois.json').pois;
const zones = read<{ zones: { id: string; lat: number; lng: number; arena?: number }[] }>(
  'content/svendborg/zones.json',
).zones;
const at = (id: string) => {
  const p = pois.find((x) => x.id === id);
  if (!p) throw new Error(`No POI ${id}`);
  return { lat: p.lat, lng: p.lng };
};
const ARENA_ZONES = zones.filter((z) => z.arena).map((z) => z.id);
const ODENSE = { lat: 55.3998, lng: 10.3852 };
const HARBOUR = at('svb_arena1');

interface DevSave {
  region: string;
  onboarding: string;
  starter: string | null;
  badges: number[];
  zones: string[];
  defeatedTrainers: string[];
  coins: number;
  bag: Record<string, number>;
  campaigns: Record<string, { badges: number[] } | undefined>;
}
const devSave = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __omlDev: { save: () => unknown } }).__omlDev.save(),
  ) as Promise<DevSave>;
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

const STRONG = [
  'Fjord Surge',
  'Rune Slab',
  'Elf Dance',
  'Beech Crown',
  'Harbour Wave',
  'Rampart Slam',
];

async function fight(page: Page): Promise<string> {
  const battle = page.locator('main.battle');
  for (let i = 0; i < 400; i++) {
    for (let k = 0; k < 600; k++) {
      if ((await battle.getAttribute('data-busy')) === 'false') break;
      await page.click('.log', { timeout: 1000 }).catch(() => undefined);
      await page.waitForTimeout(50);
    }
    if ((await battle.getAttribute('data-over')) === 'true') {
      const text = (await page.locator('.result').textContent()) ?? '';
      await page.click('.controls .btn.primary');
      return text;
    }
    if ((await battle.getAttribute('data-replacing')) === 'true') {
      await page.locator('.battle-pick:not(:disabled)').first().click();
      continue;
    }
    let picked = false;
    for (const name of STRONG) {
      const btn = page.locator('.move-btn:not(:disabled)', { hasText: name });
      if ((await btn.count()) > 0) {
        await btn.first().click();
        picked = true;
        break;
      }
    }
    if (!picked) await page.locator('.move-btn:not(:disabled)').first().click();
  }
  throw new Error('Battle did not end');
}

async function tapPoi(page: Page, poiId: string) {
  await teleport(page, at(poiId));
  const acted = page.locator(
    `[data-testid=poi-card][data-poi=${poiId}], main.battle, [data-testid=screen-market]`,
  );
  // the simulated GPS fix lands a moment after the teleport, and a jump reads as moving
  // fast: press once the place is in reach (a second press would act twice)
  await page
    .locator(`[data-testid=play-map][data-reach~="${poiId}"]`)
    .waitFor({ state: 'attached', timeout: 45_000 });
  await page.getByTestId(`poi-stamp-${poiId}`).evaluate((e) => (e as HTMLElement).click());
  await acted.first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function afterBattle(page: Page) {
  const result = page.locator('[data-testid=result-card] .btn');
  if (await result.isVisible().catch(() => false)) await result.click();
  for (let i = 0; i < 6; i++) {
    const skip = page.getByTestId('choice-skip');
    if (!(await skip.isVisible().catch(() => false))) break;
    await skip.click();
  }
}

async function mapReady(page: Page) {
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.waitForFunction(() => '__omlSim' in window && '__omlMap' in window);
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 30_000 });
}

test('Svendborg: walk in from Odense, own starters, arenas 1–8, a ferry island, and back', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    errors.push(String(e));
    console.log('page error:', e.message, e.stack);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.addInitScript(() => localStorage.setItem('oml.welcome.v1', '1'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await dev(page, 'skipOnboarding', 'gnistkat');
  await mapReady(page);
  await dev(page, 'setBadges', [1, 2]);

  // ---- walking into Svendborg starts its own campaign at its own starters -----------------
  await teleport(page, HARBOUR);
  await expect(page.getByTestId('onboarding-starter')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('onboarding-new-region')).toContainText('Svendborg');
  for (const id of ['svb_saelkalv', 'svb_kridtling', 'svb_ternling'])
    await expect(page.getByTestId(`starter-${id}`)).toBeVisible();
  await expect(page.getByTestId('starter-gnistkat')).toHaveCount(0);
  await page.getByTestId('starter-svb_kridtling').click();
  let save = await devSave(page);
  expect(save.region).toBe('svendborg');
  expect(save.starter).toBe('svb_kridtling');
  expect(save.campaigns.odense?.badges).toEqual([1, 2]);
  await mapReady(page);
  // the Svendborg tutorial creature is there to catch; skip ahead for the arenas
  await dev(page, 'skipOnboarding');
  await dev(page, 'setFast');
  await dev(page, 'addCreature', 'svb_havhest', 10);
  await dev(page, 'addCreature', 'svb_guldhoevding', 10);
  await dev(page, 'addCreature', 'svb_hyldemor', 10);
  await dev(page, 'openZones', ARENA_ZONES);

  // ---- a route trainer and a market -------------------------------------------------------
  await dev(page, 'setTeamLevel', 100);
  const route = pois.find((p) => p.kind === 'trainer')!;
  const coins0 = (await devSave(page)).coins;
  await tapPoi(page, route.id);
  await expect(page.locator('main.battle')).toBeVisible();
  await fight(page);
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await afterBattle(page);
  expect((await devSave(page)).coins).toBeGreaterThan(coins0);
  const market = pois.find((p) => p.kind === 'market')!;
  await tapPoi(page, market.id);
  await expect(page.getByTestId('screen-market')).toBeVisible();
  const before = (await devSave(page)).bag.basic_charm ?? 0;
  await page.getByTestId('buy-basic_charm').click();
  expect((await devSave(page)).bag.basic_charm ?? 0).toBe(before + 1);
  await page.getByTestId('screen-back').click();

  // ---- arenas 1–8: junior, leader, badge --------------------------------------------------
  for (let n = 1; n <= 8; n++) {
    await dev(
      page,
      'setBadges',
      Array.from({ length: n - 1 }, (_, i) => i + 1),
    );
    for (let step = 0; step < 2; step++) {
      await dev(page, 'setTeamLevel', 100);
      await tapPoi(page, `svb_arena${n}`);
      await expect(page.locator('main.battle')).toBeVisible();
      await fight(page);
      if (step === 0) {
        await expect(page.getByTestId('result-card')).toContainText('You beat');
        await afterBattle(page);
      }
    }
    await expect(page.getByTestId('badge-ceremony')).toHaveAttribute('data-badge', String(n));
    await page.getByTestId('ceremony-done').click();
    await afterBattle(page);
    save = await devSave(page);
    expect(save.badges).toContain(n);
    expect(save.defeatedTrainers).toContain(`svb_arena${n}_junior`);
  }
  expect((await devSave(page)).badges).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

  // ---- P28: Svendborg is open, so a ferry island needs no opening on arrival --------------
  const skaroe = zones.find((z) => z.id === 'svb_skaroe')!;
  const zonesBefore = (await devSave(page)).zones;
  await teleport(page, { lat: skaroe.lat, lng: skaroe.lng });
  await page.waitForTimeout(3000);
  expect((await devSave(page)).zones).toEqual(zonesBefore);

  // ---- back to Odense: its campaign is as it was ------------------------------------------
  await teleport(page, ODENSE);
  await expect.poll(async () => (await devSave(page)).region, { timeout: 20_000 }).toBe('odense');
  await mapReady(page);
  save = await devSave(page);
  expect(save.badges).toEqual([1, 2]);
  expect(save.starter).toBe('gnistkat');
  expect(save.campaigns.svendborg?.badges).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(errors).toEqual([]);
});
