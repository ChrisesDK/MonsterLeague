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

  // the field guide names Mosling's main home (district 2)
  await page.getByTestId('menu-guide').click();
  await page.locator('.chip-row .btn', { hasText: /^2$/ }).click();
  await expect(page.getByTestId('guide-mosling')).toContainText('Kirkendrup Skov');
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
      (window as unknown as { __omlDev: { save: () => { coins: number } | null } }).__omlDev.save()
        ?.coins !== undefined,
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
