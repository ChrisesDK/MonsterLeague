import { expect, test } from '@playwright/test';

/** An accidental "go back" (edge swipe) asks before leaving the site or app. */
test('the first back asks "Leave the game?"; Stay keeps you here, Leave goes back', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/playtest');
  await page.getByRole('heading', { name: 'Battle playtest' }).waitFor();
  // the guard arms on the first tap (Chrome skips history entries added without input)
  await page.getByRole('heading', { name: 'Battle playtest' }).click();
  const back = () => page.goBack({ timeout: 2000 }).catch(() => null);
  await back();
  await expect(page.getByTestId('leave-guard')).toBeVisible();
  await expect(page.getByTestId('leave-guard')).toContainText('Leave the game?');
  expect(page.url()).toContain('#/playtest');
  await page.getByTestId('leave-stay').click();
  await expect(page.getByTestId('leave-guard')).toHaveCount(0);
  // still guarded the next time (Stay guards again)
  await back();
  await expect(page.getByTestId('leave-guard')).toBeVisible();
  expect(page.url()).toContain('#/playtest');
  // in-app navigation going back is not caught: map game → back to the playtest
  await page.getByTestId('leave-stay').click();
  await page.getByTestId('to-map').click();
  await expect(page).toHaveURL(/#\/$/);
  await back();
  await expect(page).toHaveURL(/#\/playtest$/);
  await expect(page.getByTestId('leave-guard')).toHaveCount(0);
  // Leave: back to the page before the game
  await back();
  await expect(page.getByTestId('leave-guard')).toBeVisible();
  await page.getByTestId('leave-go').click();
  await expect(page).toHaveURL('about:blank');
});

test('while it asks, a second back gesture really leaves', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oml.locale', 'en'));
  await page.goto('#/playtest');
  const h = page.getByRole('heading', { name: 'Battle playtest' });
  await h.click();
  const back = () => page.goBack({ timeout: 2000 }).catch(() => null);
  await back();
  await expect(page.getByTestId('leave-guard')).toBeVisible();
  await back();
  await expect(page).toHaveURL('about:blank');
});

test('installed app: the back gesture is caught by a close watcher; Leave closes the app, Stay ignores the swipe', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('oml.locale', 'en');
    localStorage.setItem('oml.e2e.installed', '1');
    // record window.close() (a test tab can't really close itself)
    (window as unknown as { __closed: number }).__closed = 0;
    window.close = () => {
      (window as unknown as { __closed: number }).__closed++;
    };
  });
  await page.goto('#/playtest');
  await expect(page.locator('html')).toHaveAttribute('data-back-guard', 'watcher');
  const h = page.getByRole('heading', { name: 'Battle playtest' });
  await h.click();
  const entries = await page.evaluate(() => history.length);
  // Escape is a close request on desktop, like the back gesture on a phone
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('leave-guard')).toBeVisible();
  // no history entry was added (an installed app may only close itself with one entry)
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.getByTestId('leave-stay').click();
  await expect(page.getByTestId('leave-guard')).toHaveCount(0);
  expect(page.url()).toContain('#/playtest');
  // in-app links replace the entry instead of adding one
  await page.getByTestId('to-map').click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  // asked again after Stay; Leave closes the app
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('leave-guard')).toBeVisible();
  await page.getByTestId('leave-go').click();
  expect(await page.evaluate(() => (window as unknown as { __closed: number }).__closed)).toBe(1);
});
