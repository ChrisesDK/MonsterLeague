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
const STATION = { lat: 55.4017, lng: 10.3866 };
/** Munke Mose: its own zone (P22), opened by walking Route 20; closed in this run. */
const MUNKEMOSE = { lat: 55.3905, lng: 10.383 };
/** In Næsbyhoved Skov (zone naesbyhoved, district 2), opened by walking Route 1. */
const DISTRICT2 = { lat: 55.4122, lng: 10.3725 };
/** The harbour (zone havnen): not opened in this run. */
const HARBOUR = { lat: 55.412, lng: 10.388 };

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

/**
 * Fights until the battle ends. `move` picks a move by name when the active creature has
 * it (the first move is often a resisted Folk move, which turns easy fights into a stall).
 */
async function fight(page: Page, opts: { charm?: boolean; move?: string } = {}): Promise<string> {
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
      await page.locator('.battle-pick:not(:disabled)').first().click();
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
    const preferred = opts.move
      ? page.locator('.move-btn:not(:disabled)', { hasText: opts.move })
      : null;
    if (preferred && (await preferred.count()) > 0) await preferred.first().click();
    else await page.locator('.move-btn:not(:disabled)').first().click();
  }
  throw new Error('Battle did not end');
}

/**
 * Walks to a POI and presses its stamp (POIs are press-based, owner request): a ready trainer
 * or arena starts its battle, a rest stop heals; otherwise a card says why. Returns the card.
 */
async function tapPoi(page: Page, poiId: string) {
  await teleport(page, at(poiId));
  const card = page.locator(`[data-testid=poi-card][data-poi=${poiId}]`);
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
  return card;
}

test('onboarding to badge 2 (districts 1 and 2, open wildlife), with reloads', async ({ page }) => {
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
    // attached, not visible: a creature behind the bottom of the screen is hidden (off screen)
    await marker.waitFor({ state: 'attached', timeout: 30_000 });
    await expect(page.locator('[data-testid=journal-card][data-guide=tutorial]')).toBeVisible();
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

  // GDD v1.9: onboarding ends with exactly one clear goal, pointing into district 1.
  await teleport(page, STATION);
  const goal = page.locator('[data-testid=journal-card][data-district="1"]');
  await expect(goal).toHaveCount(1);
  await expect(goal).toBeVisible();
  await expect(goal).toHaveAttribute('data-guide', /^d1\./);
  await expect(goal.locator('.arrow')).toHaveAttribute('data-bearing', /\d+/);

  // ---- reload: the save survives -----------------------------------------------------------
  await page.reload();
  await openMap(page);
  save = await devSave(page);
  expect(save.team).toHaveLength(2);
  await dev(page, 'setFast');

  // ---- GDD v1.7, 0 badges in a far district: commons battle at band 1, rares are too wild ----
  await teleport(page, HARBOUR);
  await dev(page, 'injectSpawn', {
    speciesId: 'soeormling',
    rarity: 'rare',
    district: 8,
    ...HARBOUR,
    lat: HARBOUR.lat + 0.0002,
  });
  await dev(page, 'injectSpawn', {
    speciesId: 'grimaelling',
    district: 8,
    levelRoll: 0.5,
    ...HARBOUR,
  });
  // P28: Odense is open, so nothing is too wild: the far district's rare battles too, at
  // the player's own band
  await expect(page.locator('.spawn-marker.too-wild')).toHaveCount(0);
  await expect(page.locator('.spawn-marker[data-kind=ok]')).toHaveCount(2);
  const common = page.locator('.spawn-marker[data-kind=ok][aria-label*="Grim"]');
  // band 1 is L3-8; roll 0.5 → L6 for a player with 0 badges
  await expect(common).toHaveAttribute('aria-label', /level 6/);
  await common.evaluate((e) => (e as HTMLElement).click());
  await expect(page.locator('.combatant.side-1')).toContainText('Level 6');
  await fight(page, { charm: true });
  await page.waitForSelector('.maplibregl-canvas');
  save = await devSave(page);
  const caughtFar = [...save.team, ...(save.storage as DevSave['team'])].find(
    (c) => c.speciesId === 'grimaelling',
  );
  if (caughtFar) expect(caughtFar.level).toBe(6);
  await page
    .locator('[data-testid=result-card] .btn')
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // ---- route trainer: win, reward, marked beaten -------------------------------------------
  await dev(page, 'setTeamLevel', 12);
  let card = await tapPoi(page, 'trainer_ole');
  await fight(page, { move: 'Beech Lash' });
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await expect(page.getByTestId('reward')).toBeVisible();
  await expect(page.getByTestId('reward-coins')).toContainText('skilling');
  await page.locator('[data-testid=result-card] .btn').click();
  save = await devSave(page);
  expect(save.defeatedTrainers).toContain('route1_ole');
  expect((save as unknown as { coins: number }).coins).toBeGreaterThan(0);
  // the reward (route finds on Route 1 may add more Clear Drops, P28)
  expect(save.bag.clear_drops).toBeGreaterThanOrEqual(1);
  // pressing the stamp again: the card says the trainer is beaten (no new battle)
  card = await tapPoi(page, 'trainer_ole');
  await expect(card).toHaveAttribute('data-state', 'beaten');
  await card.getByTestId('poi-close').click();
  await expect(card).toHaveCount(0);

  // ---- lose a battle (reloading mid-battle), stay fainted ----------------------------------
  await dev(page, 'setTeamHp', 1);
  card = await tapPoi(page, 'trainer_niels');
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
  await expect(page.locator('[data-testid=journal-card][data-guide=fainted]')).toBeVisible();
  card = await tapPoi(page, 'trainer_niels');
  await expect(card).toHaveAttribute('data-state', 'teamFainted');

  // ---- heal at a rest stop ------------------------------------------------------------------
  card = await tapPoi(page, 'rest_library');
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
  await dev(page, 'injectSpawn', {
    speciesId: 'mosbille',
    rarity: 'rare',
    district: 1,
    ...near,
    requires: 'forager',
  });
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
  card = await tapPoi(page, 'rest_library');
  await dev(page, 'setTeamLevel', 15);
  await dev(page, 'addCreature', 'gnistkat', 15);
  await dev(page, 'addCreature', 'aaodder', 15);
  card = await tapPoi(page, 'arena1'); // the junior first
  await fight(page);
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await page.locator('[data-testid=result-card] .btn').click();

  for (let attempt = 0; attempt < 4; attempt++) {
    card = await tapPoi(page, 'rest_library');
    card = await tapPoi(page, 'arena1'); // then the leader
    // P28: the leader battle opens by saying what the team is for this player (owner)
    if (attempt === 0)
      await expect(page.getByTestId('battle-guide')).toContainText('no badges yet');
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

  // P28: Odense is open: the rares of Næsbyhoved and Munke Mose battle without a route walked.
  await teleport(page, DISTRICT2);
  await dev(page, 'injectSpawn', {
    speciesId: 'kampetrold',
    rarity: 'rare',
    district: 2,
    ...DISTRICT2,
  });
  await expect(page.locator('.spawn-marker.too-wild')).toHaveCount(0);
  await expect(page.locator('.spawn-marker[data-kind=ok]')).toHaveCount(1);
  await teleport(page, MUNKEMOSE);
  await dev(page, 'injectSpawn', {
    speciesId: 'soeormling',
    rarity: 'rare',
    district: 4,
    ...MUNKEMOSE,
  });
  await expect(page.locator('.spawn-marker.too-wild')).toHaveCount(0);

  // ---- district 2: a route trainer, the junior, the Stone leader, badge 2 ---------------------
  await dev(page, 'setTeamLevel', 15);
  card = await tapPoi(page, 'trainer_karen');
  await fight(page, { move: 'Beech Lash' });
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await page.locator('[data-testid=result-card] .btn').click();
  card = await tapPoi(page, 'rest_naesbyhoved');
  // a little stronger for the junior, so an unlucky battle doesn't fail the run
  await dev(page, 'setTeamLevel', 17);
  card = await tapPoi(page, 'arena2'); // the junior first
  await fight(page, { move: 'Beech Lash' });
  await expect(page.getByTestId('result-card')).toContainText('You beat');
  await page.locator('[data-testid=result-card] .btn').click();
  // badge 1 raised obedience to 20, so a level-19 team still obeys
  await dev(page, 'setTeamLevel', 19);
  for (let attempt = 0; attempt < 4; attempt++) {
    card = await tapPoi(page, 'rest_naesbyhoved');
    card = await tapPoi(page, 'arena2'); // then the leader
    if (attempt === 0)
      await expect(page.getByTestId('battle-guide')).toContainText('You have 1 badge');
    await fight(page, { move: 'Beech Lash' });
    if ((await devSave(page)).badges.includes(2)) break;
    await page.locator('[data-testid=result-card] .btn').click();
  }
  await expect(page.getByTestId('badge-ceremony')).toHaveAttribute('data-badge', '2');
  await expect(page.getByTestId('badge-ceremony')).toContainText('25');
  await page.getByTestId('ceremony-done').click();
  save = await devSave(page);
  expect(save.badges).toEqual([1, 2]);
  expect(save.defeatedTrainers).toEqual(
    expect.arrayContaining(['route2_karen', 'arena2_junior', 'leader_stone']),
  );

  // Badges screen, after one more reload.
  await page.reload();
  await openMap(page);
  // a learn-move / evolve question may be waiting (which creatures level up depends on the
  // random catches): answer "not now" so it doesn't cover the menu button
  for (let i = 0; i < 4; i++) {
    const skip = page.getByTestId('choice-skip');
    if (!(await skip.isVisible().catch(() => false))) break;
    await skip.click();
  }
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-badges').click();
  await expect(page.locator('[data-testid=badge-1].earned')).toBeVisible();
  await expect(page.locator('[data-testid=badge-2].earned')).toBeVisible();
  await expect(page.locator('[data-testid=badge-3].earned')).toHaveCount(0);

  expect(errors).toEqual([]);
});
