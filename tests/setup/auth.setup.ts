import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { blockAds } from '../helpers/ads';
import { PROFILE_STATE_PATH } from '../helpers/auth-state';

// Setup project (see playwright.config.ts `dependencies`): guarantees a valid
// logged-in storage state before any functional test runs. Runs with
// `video: off`, so nothing here is ever recorded. Usually a fast no-op —
// re-registers only when the saved session is missing or expired.
test('authenticate as profile user', async ({ page, browser }) => {
  await blockAds(page);

  const reuse = await (async () => {
    try {
      const ctx = await browser.newContext({ storageState: PROFILE_STATE_PATH });
      const probe = await ctx.newPage();
      await probe.goto('/');
      const ok = await probe.getByText(/logged in as/i).isVisible({ timeout: 8000 });
      await ctx.close();
      return ok;
    } catch {
      return false;
    }
  })();
  if (reuse) return;

  const ts = Date.now();
  await page.goto('/login');
  await page.locator('[data-qa="signup-name"]').fill(`profile${ts}`);
  await page.locator('[data-qa="signup-email"]').fill(`profile${ts}@example.com`);
  await page.locator('[data-qa="signup-button"]').click();
  await page.locator('#id_gender1').check({ force: true }).catch(() => {});
  await page.locator('[data-qa="password"]').fill('Test1234!');
  await page.locator('#days').selectOption('10');
  await page.locator('#months').selectOption('5');
  await page.locator('#years').selectOption('1990');
  await page.locator('[data-qa="first_name"]').fill('Profile');
  await page.locator('[data-qa="last_name"]').fill('User');
  await page.locator('[data-qa="address"]').fill('1 Profile Street');
  await page.locator('#country').selectOption('United States');
  await page.locator('[data-qa="state"]').fill('California');
  await page.locator('[data-qa="city"]').fill('Los Angeles');
  await page.locator('[data-qa="zipcode"]').fill('90001');
  await page.locator('[data-qa="mobile_number"]').fill('1234567890');
  await page.locator('[data-qa="create-account"]').click();
  await expect(page.locator('[data-qa="account-created"]')).toBeVisible();
  await page.locator('[data-qa="continue-button"]').click();
  fs.mkdirSync(path.dirname(PROFILE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: PROFILE_STATE_PATH });
});
