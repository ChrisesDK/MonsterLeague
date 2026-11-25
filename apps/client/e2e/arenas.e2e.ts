import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * D168 end to end: arenas 3–8 are playable in order (junior, then leader, then the badge
 * ceremony), route trainers in far districts battle and pay coins, and a market sells. Dev
 * hooks (#/dev/map only) open the zones and give a level-100 team: it wins even when it
 * ignores orders (above the obedience level, GDD), so the run is not left to luck. The
 * leaders' balance is the sim's job (tools/sim/test/balance.test.ts).
 */

interface PoiJson {
  pois: { id: string; lat: number; lng: number; kind: string; zone: string; arena?: number }[];
}
const pois = (
  JSON.parse(
    readFileSync(
      new URL('../../../packages/data/content/odense/pois.json', import.meta.url),
      'utf8',
    ),
  ) as PoiJson
).pois;
const at = (id: string) => {
  const p = pois.find((x) => x.id === id);
  if (!p) throw new Error(`No POI ${id}`);
  return { lat: p.lat, lng: p.lng };
};
const ARENA_ZONES = [3, 4, 5, 6, 7, 8].map((n) => pois.find((p) => p.arena === n)!.zone);

interface DevSave {
  badges: number[];
  defeatedTrainers: string[];
  coins: number;
  bag: Record<string, number>;
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

/** Strong attacks the level-100 test team knows; the first one available is used. */
const STRONG = [
  'Fjord Surge',
  'Rune Slab',
  'Elf Dance',
  'Beech Crown',
  'Harbour Wave',
  'Rampart Slam',
];

/** Fights until the battle ends; answers replacement prompts. Returns the result text. */
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
      await page.locator('.list-panel .list-btn:not(:disabled)').first().click();
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

/** Walks to a POI and presses its stamp until it acts (battle, heal, market or a card). */
async function tapPoi(page: Page, poiId: string) {
  await teleport(page, at(poiId));
  const acted = page.locator(
    `[data-testid=poi-card][data-poi=${poiId}], main.battle, [data-testid=screen-market]`,
  );
  for (let i = 0; i < 20; i++) {
    await page.getByTestId(`poi-stamp-${poiId}`).evaluate((e) => (e as HTMLElement).click());
    const ok = await acted
      .first()
      .waitFor({ state: 'visible', timeout: 400 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
}

/** Closes whatever follows a battle: the result card, then any learn-move/evolve question. */
async function afterBattle(page: Page) {
  const result = page.locator('[data-testid=result-card] .btn');
  if (await result.isVisible().catch(() => false)) await result.click();
  for (let i = 0; i < 6; i++) {
    const skip = page.getByTestId('choice-skip');
    if (!(await skip.isVisible().catch(() => false))) break;
    await skip.click();
  }
}

test('arenas 3–8 in order, far route trainers and a market (D168)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await dev(page, 'skipOnboarding', 'aaodder');
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.waitForFunction(() => '__omlSim' in window);
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 30_000 });
  await dev(page, 'setFast');
  // final stages (dev-made creatures don't evolve), so the level-100 team hits hard
  await dev(page, 'addCreature', 'lindorm', 10);
  await dev(page, 'addCreature', 'bjergtrold', 10);
  await dev(page, 'addCreature', 'ellekonge', 10);
  await dev(page, 'openZones', [...ARENA_ZONES, 'korup', 'holeskov']);
  await dev(page, 'setBadges', [1, 2]);

  // ---- a route trainer in district 8 (Route 33): a win pays coins ---------------------------
  await dev(page, 'setTeamLevel', 100);
  const coins0 = (await devSave(page)).coins;
  await tapPoi(page, 'trainer_r33a');
  await expect(page.locator('main.battle')).toBeVisible();
  await fight(page);
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await afterBattle(page);
  let save = await devSave(page);
  expect(save.defeatedTrainers).toContain('route33_a');
  expect(save.coins).toBeGreaterThan(coins0);

  // ---- a market in district 8 sells charms for coins ----------------------------------------
  await tapPoi(page, 'market_korup');
  await expect(page.getByTestId('screen-market')).toBeVisible();
  const before = (await devSave(page)).bag.basic_charm ?? 0;
  await page.getByTestId('buy-basic_charm').click();
  expect((await devSave(page)).bag.basic_charm ?? 0).toBe(before + 1);
  await page.getByTestId('screen-back').click();

  // ---- arenas 3–8: junior first, then the leader, then the badge ----------------------------
  for (let n = 3; n <= 8; n++) {
    await dev(
      page,
      'setBadges',
      Array.from({ length: n - 1 }, (_, i) => i + 1),
    );
    for (let step = 0; step < 2; step++) {
      await dev(page, 'setTeamLevel', 100); // also heals
      await tapPoi(page, `arena${n}`);
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
    expect(save.defeatedTrainers).toContain(`arena${n}_junior`);
  }
  save = await devSave(page);
  expect(save.badges).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(save.defeatedTrainers).toEqual(
    expect.arrayContaining([
      'leader_water',
      'leader_grove',
      'leader_spirit',
      'leader_fire',
      'leader_mixed',
      'leader_storm',
    ]),
  );

  // the badge case shows all eight
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-badges').click();
  for (let n = 1; n <= 8; n++)
    await expect(page.locator(`[data-testid=badge-${n}].earned`)).toBeVisible();

  expect(errors).toEqual([]);
});
