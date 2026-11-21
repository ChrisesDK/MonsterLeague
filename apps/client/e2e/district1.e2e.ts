import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * M2b end to end: onboarding → starter → tutorial catch → walk to district 1 → beat a
 * trainer → lose a battle → heal at a rest stop → junior trainer → arena 1 leader → badge 1,
 * with reloads mid-way (the save must survive, including an active battle). The GPS
 * simulator moves the player; dev hooks (#/dev/map only) set levels so the outcome of each
 * battle is predictable.
 */

interface PoiJson {
  pois: { id: string; lat: number; lng: number }[];
}
const pois = (
  JSON.parse(
    readFileSync(
      new URL('../../../packages/data/content/pois.odense.json', import.meta.url),
      'utf8',
    ),
  ) as PoiJson
).pois;
const at = (id: string) => {
  const p = pois.find((x) => x.id === id);
  if (!p) throw new Error(`No POI ${id}`);
  return { lat: p.lat, lng: p.lng };
};
const STATION = { lat: 55.4017, lng: 10.3866 };
/** A district-2 spot in Munke Mose (locked until badge 1). */
const DISTRICT2 = { lat: 55.3895, lng: 10.383 };

interface DevSave {
  onboarding: string;
  team: { uid: string; speciesId: string; hp: number; level: number; fieldAbility?: string }[];
  storage: unknown[];
  bag: Record<string, number>;
  badges: number[];
  defeatedTrainers: string[];
  battle: { kind: string; state: { turn: number } } | null;
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

async function openMap(page: Page) {
  await page.goto('#/dev/map');
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.waitForFunction(() => 'omlSim' in window || '__omlSim' in window);
}

/** Fights until the battle ends: first usable move, replacements when needed. */
async function fight(page: Page, opts: { charm?: boolean } = {}): Promise<string> {
  const battle = page.locator('main.battle');
  for (let i = 0; i < 400; i++) {
    // wait for the turn's playback to finish (tapping the log skips the text)
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
    if (opts.charm && i > 0) {
      await page.locator('.action-row .btn').nth(1).click();
      const charm = page.locator('.list-panel .list-btn[data-item$=_charm]:not(:disabled)');
      if ((await charm.count()) > 0) {
        await charm.first().click();
        continue;
      }
      await page.locator('.list-panel > .btn:not(.list-btn)').click(); // back
    }
    await page.locator('.move-btn:not(:disabled)').first().click();
  }
  throw new Error('Battle did not end');
}

async function poiAction(page: Page, poiId: string) {
  await teleport(page, at(poiId));
  const card = page.locator(`[data-testid=poi-card][data-poi=${poiId}]`);
  await expect(card).toBeVisible();
  return card;
}

test('district 1: onboarding to badge 1, with reloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  // ---- onboarding (English UI; a new save takes the app language) ---------------------------
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-location').waitFor();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-starter').waitFor();
  await page.getByTestId('starter-boegling').click();
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await teleport(page, STATION);
  await dev(page, 'setFast');

  // ---- tutorial creature: personal, 100–200 m away, guided easy catch -----------------------
  for (let attempt = 0; attempt < 4; attempt++) {
    const marker = page.getByTestId('tutorial-marker');
    await marker.waitFor({ timeout: 30_000 });
    await expect(page.locator('[data-testid=guide-card][data-guide=tutorial]')).toBeVisible();
    const spot = await marker.evaluate((e) => ({
      lat: Number((e as HTMLElement).dataset.lat),
      lng: Number((e as HTMLElement).dataset.lng),
    }));
    await teleport(page, spot);
    await page.waitForTimeout(500);
    await marker.evaluate((e) => (e as HTMLElement).click());
    await expect(page.getByTestId('battle-guide')).toBeVisible();
    await fight(page, { charm: true });
    if ((await devSave(page)).onboarding === 'done') break;
  }
  let save = await devSave(page);
  expect(save.onboarding).toBe('done');
  expect(save.team.map((c) => c.speciesId)).toEqual(['boegling', 'torvdue']);
  await expect(page.getByTestId('result-card')).toBeVisible();
  await page.locator('[data-testid=result-card] .btn').click();

  // The map points to district 1 (here: already in it, so the nearest rest stop).
  await teleport(page, STATION);
  await expect(page.locator('[data-testid=guide-card][data-guide=district1]')).toBeVisible();

  // ---- reload: the save survives -----------------------------------------------------------
  await page.reload();
  await openMap(page);
  save = await devSave(page);
  expect(save.team).toHaveLength(2);
  await dev(page, 'setFast');

  // ---- a locked district: spawns are too wild ----------------------------------------------
  await teleport(page, DISTRICT2);
  await dev(page, 'injectSpawn', { speciesId: 'grimaelling', level: 10, ...DISTRICT2 });
  await expect(page.locator('.spawn-marker.too-wild')).toHaveCount(1);

  // ---- route trainer: win, reward, marked beaten -------------------------------------------
  await dev(page, 'setTeamLevel', 12);
  let card = await poiAction(page, 'trainer_ole');
  await expect(card).toHaveAttribute('data-state', 'ready');
  await card.getByTestId('poi-action').click();
  await fight(page);
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await expect(page.getByTestId('reward')).toBeVisible();
  await page.locator('[data-testid=result-card] .btn').click();
  save = await devSave(page);
  expect(save.defeatedTrainers).toContain('route1_ole');
  expect(save.bag.clear_drops).toBe(1);
  await expect(page.locator('[data-testid=poi-card][data-poi=trainer_ole]')).toHaveAttribute(
    'data-state',
    'beaten',
  );

  // ---- lose a battle (reloading mid-battle), stay fainted ----------------------------------
  await dev(page, 'setTeamHp', 1);
  card = await poiAction(page, 'trainer_niels');
  await card.getByTestId('poi-action').click();
  await page.locator('.move-btn:not(:disabled)').first().click();
  await expect(page.locator('main.battle')).toHaveAttribute('data-busy', 'false', {
    timeout: 60_000,
  });
  const before = await devSave(page);
  expect(before.battle?.kind).toBe('trainer');
  await page.reload();
  await openMap(page);
  // the simulator restarts at its default spot after a reload; walk back
  await teleport(page, at('trainer_niels'));
  const after = await devSave(page);
  expect(after.battle?.state.turn).toBe(before.battle?.state.turn);
  await page.getByTestId('resume-battle').click();
  await fight(page);
  await expect(page.getByTestId('result-card')).toContainText('won this time');
  await page.locator('[data-testid=result-card] .btn').click();
  save = await devSave(page);
  expect(save.team.every((c) => c.hp === 0)).toBe(true);
  expect(save.defeatedTrainers).not.toContain('route1_niels');
  await expect(page.locator('[data-testid=guide-card][data-guide=fainted]')).toBeVisible();
  await expect(page.locator('[data-testid=poi-card][data-poi=trainer_niels]')).toHaveAttribute(
    'data-state',
    'teamFainted',
  );

  // ---- heal at a rest stop ------------------------------------------------------------------
  card = await poiAction(page, 'rest_library');
  await card.getByTestId('poi-action').click();
  await expect(card).toContainText('fully healed');
  save = await devSave(page);
  expect(save.team.every((c) => c.hp > 0)).toBe(true);
  expect(save.bag.basic_charm).toBeGreaterThanOrEqual(5);

  // ---- Forager (dev toggle → teach → the hidden spawn becomes battle-able) ------------------
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('dev-ability-forager').check();
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-team').click();
  await page.getByTestId('team-0').click();
  await page.getByTestId('teach-forager').click();
  if (await page.locator('.list-panel .list-btn').first().isVisible()) {
    // four moves known: forget the first one
    const forget = page.locator('.panel-section .list-panel .list-btn').first();
    if (await forget.isVisible()) await forget.click();
  }
  await expect(page.getByTestId('detail-ability')).toBeVisible();
  await page.getByTestId('screen-back').click();
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-map').click();
  await page.waitForSelector('.maplibregl-canvas');
  // a Forager spawn in Kongens Have (park, district 1)
  const near = { lat: at('arena1').lat - 0.0003, lng: at('arena1').lng };
  await teleport(page, near);
  await dev(page, 'injectSpawn', { speciesId: 'mosbille', level: 5, ...near, requires: 'forager' });
  const forager = page.locator('.spawn-marker[data-kind=ok]');
  await expect(forager).toHaveCount(1);
  await forager.evaluate((e) => (e as HTMLElement).click());
  await fight(page);
  await page.waitForSelector('.maplibregl-canvas');
  expect((await devSave(page)).battle).toBeNull();
  // a win shows a toast, a catch shows a card
  await page
    .locator('[data-testid=result-card] .btn')
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // ---- arena 1: junior first, then the leader ------------------------------------------------
  card = await poiAction(page, 'rest_library');
  await card.getByTestId('poi-action').click();
  await dev(page, 'setTeamLevel', 15);
  await dev(page, 'addCreature', 'gnistkat', 15);
  await dev(page, 'addCreature', 'aaodder', 15);
  card = await poiAction(page, 'arena1');
  await expect(card).toContainText('junior');
  await card.getByTestId('poi-action').click();
  await fight(page);
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await page.locator('[data-testid=result-card] .btn').click();

  for (let attempt = 0; attempt < 4; attempt++) {
    card = await poiAction(page, 'rest_library');
    await card.getByTestId('poi-action').click();
    card = await poiAction(page, 'arena1');
    await expect(card).toContainText('leader');
    await card.getByTestId('poi-action').click();
    await fight(page);
    if ((await devSave(page)).badges.includes(1)) break;
    await page.locator('[data-testid=result-card] .btn').click();
  }

  // ---- badge 1 ---------------------------------------------------------------------------
  await expect(page.getByTestId('badge-ceremony')).toBeVisible();
  await expect(page.getByTestId('badge-ceremony')).toContainText('20');
  await page.getByTestId('ceremony-done').click();
  save = await devSave(page);
  expect(save.badges).toEqual([1]);
  expect(save.defeatedTrainers).toEqual(
    expect.arrayContaining(['route1_ole', 'arena1_junior', 'leader_folk']),
  );
  expect(save.bag.revive_leaf).toBe(1);

  // District 2 is open now: the same kind of spawn is no longer too wild.
  await teleport(page, DISTRICT2);
  await dev(page, 'injectSpawn', { speciesId: 'grimaelling', level: 10, ...DISTRICT2 });
  await expect(page.locator('.spawn-marker.too-wild')).toHaveCount(0);

  // Badges screen, after one more reload.
  await page.reload();
  await openMap(page);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-badges').click();
  await expect(page.locator('[data-testid=badge-1].earned')).toBeVisible();
  await expect(page.locator('[data-testid=badge-2].earned')).toHaveCount(0);

  expect(errors).toEqual([]);
});
