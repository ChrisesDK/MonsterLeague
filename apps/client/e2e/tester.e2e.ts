import { expect, test, type Page } from '@playwright/test';

/**
 * Tester features (D173–D176): the welcome at first launch (game route, then onboarding with
 * no battle-test link), feedback from the menu, save export and import, and the field
 * guide naming a destination creature's home.
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

test('first launch: the tester welcome, then onboarding without a battle-test link', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/');
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('welcome')).toContainText('Feedback');
  await page.getByTestId('welcome-next').click();
  await expect(page.getByTestId('onboarding-safety')).toBeVisible();
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding-location')).toBeVisible();
  await expect(page.locator('a[href="#/playtest"]')).toHaveCount(0);
  // seen once: a reload goes straight on
  await page.reload();
  await expect(
    page.locator('[data-testid=onboarding-safety], [data-testid=onboarding-location]'),
  ).toBeVisible();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
});

test('feedback, version, save export and import, home hints in the field guide', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/dev/map');
  await page.getByTestId('onboarding-safety').waitFor();
  await dev(page, 'skipOnboarding', 'gnistkat');
  await page.getByTestId('loading-screen').waitFor({ state: 'detached', timeout: 60_000 });

  // feedback: a menu tile, nothing pops up by itself; the phone can't share here, so it copies
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => {
    (navigator as unknown as { share?: unknown }).share = undefined;
  });
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-feedback').click();
  await expect(page.getByTestId('feedback-send')).toBeDisabled();
  await page.getByTestId('feedback-kind-balance').click();
  await page.getByTestId('feedback-text').fill('Arena 4 felt long');
  await page.getByTestId('feedback-send').click();
  await expect(page.getByTestId('feedback-status')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[balance] Arena 4 felt long');
  expect(copied).toContain('Version');
  expect(copied).not.toMatch(/\d{2}\.\d{4,}/); // no coordinates
  await page.getByTestId('screen-back').click();

  // a Glimmer lead: a sparkle after its name; its Glimmer form opens in the field guide
  await dev(page, 'makeGlimmer');
  await page.getByTestId('menu-team').click();
  await expect(page.getByTestId('team-0')).toContainText('✦');
  await page.getByTestId('screen-back').click();
  await page.getByTestId('menu-guide').click();
  await page.getByTestId('guide-gnistkat').click();
  await expect(page.getByTestId('guide-form-glimmer')).toBeEnabled();
  await page.getByTestId('guide-form-glimmer').click();
  await expect(page.getByTestId('guide-entry-img')).toHaveClass(/shiny/);
  await page.screenshot({ path: test.info().outputPath('glimmer-entry.png') });
  await page.getByTestId('screen-back').click();
  await page.getByTestId('screen-back').click();

  // the field guide: one numbered list per region, each creature once; Mosling's entry
  // names its main home, and the Svendborg tab lists Svendborg's own creatures
  await page.getByTestId('menu-guide').click();
  // the list is short (number, picture, name, state); a press opens the entry with where
  // to find it (owner request), one line per place ("Every district: …")
  await expect(page.getByTestId('guide-mosling')).not.toContainText('Kirkendrup Skov');
  await page.getByTestId('guide-mosling').click();
  await expect(page.getByTestId('guide-entry-mosling')).toBeVisible();
  // not seen yet: no map of where it lives (owner: found by exploring)
  await expect(page.getByTestId('guide-heat-map')).toHaveCount(0);
  await page.getByTestId('screen-back').click();
  await dev(page, 'see', 'mosling');
  await page.getByTestId('guide-mosling').click();
  // seen: the same as the pocket guide: types, stats, the map, and its home as a label
  await expect(page.getByTestId('type-chips')).toContainText('Grove');
  // no stats in the field guide (owner); "Found at" on its own line, the places below
  await expect(page.getByTestId('base-stats')).toHaveCount(0);
  await expect(page.getByTestId('habitat-lead')).toHaveText('Found at');
  await expect(page.getByTestId('habitat-chips')).toContainText('Kirkendrup Skov');
  await expect(page.getByTestId('state-chip')).toHaveText('seen');
  // the Glimmer form is greyed out until one is met; previous and next step through the list
  await expect(page.getByTestId('guide-form-glimmer')).toBeDisabled();
  const title = await page.locator('[data-testid=screen-guide-entry] h1').textContent();
  // a heat map of where it lives; previous / next stay put at the bottom (owner)
  await expect(page.getByTestId('guide-heat-map')).toHaveAttribute('data-ready', 'true');
  const at = async () => (await page.getByTestId('guide-next').boundingBox())!.y;
  const y0 = await at();
  await page.getByTestId('guide-next').click();
  await expect(page.locator('[data-testid=screen-guide-entry] h1')).not.toHaveText(title ?? '');
  expect(Math.abs((await at()) - y0)).toBeLessThan(2);
  await page.getByTestId('guide-prev').click();
  await expect(page.locator('[data-testid=screen-guide-entry] h1')).toHaveText(title ?? '');
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('screen-guide')).toBeVisible();
  await expect(page.getByTestId('guide-gnistkat')).toContainText('#001');
  await expect(page.locator('[data-testid^=guide-]').filter({ hasText: /^#/ })).toHaveCount(55);
  await expect(page.locator('[data-testid=guide-mosling]')).toHaveCount(1);
  await page.getByTestId('guide-tab-svendborg').click();
  await expect(page.getByTestId('guide-svb_saelkalv')).toContainText('#001');
  await page.getByTestId('guide-svb_svampling').click();
  // Svendborg's own creature, not seen in that campaign: no map yet
  await expect(page.getByTestId('screen-guide-entry')).toContainText('not seen yet');
  await expect(page.getByTestId('guide-heat-map')).toHaveCount(0);
  await page.getByTestId('screen-back').click();
  await expect(page.getByTestId('guide-totals')).toContainText('0');
  await expect(page.getByTestId('guide-gnistkat')).toHaveCount(0);
  await page.getByTestId('screen-back').click();

  // badges and progress, one tab per region
  await page.getByTestId('menu-badges').click();
  await page.getByTestId('badges-tab-svendborg').click();
  await expect(page.locator('.badge-grid')).toHaveAttribute('data-region', 'svendborg');
  await expect(page.locator('.badge-slot.earned')).toHaveCount(0);
  await page.getByTestId('screen-back').click();

  // version, export, then import the exported file back
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('settings-version')).toContainText('Version');
  await dev(page, 'addCoins', 1234);
  const exported = await page.evaluate(() =>
    JSON.stringify((window as unknown as { __omlDev: { save: () => unknown } }).__omlDev.save()),
  );
  await dev(page, 'addCoins', 1);
  await page
    .getByTestId('import-save')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'save.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exported),
    });
  await page.getByTestId('import-save-confirm').click();
  await page.waitForFunction(() => '__omlDev' in window);
  await page.waitForFunction(
    () =>
      // the hook is briefly gone while the app reloads the imported save: wait, don't throw
      (
        window as unknown as { __omlDev?: { save: () => { coins: number } | null } }
      ).__omlDev?.save()?.coins !== undefined,
  );
  const coins = await page.evaluate(
    () =>
      (window as unknown as { __omlDev: { save: () => { coins: number } } }).__omlDev.save().coins,
  );
  expect(coins).toBe(JSON.parse(exported).coins);

  // a broken file is refused with a message
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page
    .getByTestId('import-save')
    .locator('input[type=file]')
    .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.getByTestId('import-error')).toBeVisible();
});
