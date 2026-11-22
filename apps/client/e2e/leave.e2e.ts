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
