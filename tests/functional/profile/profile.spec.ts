import { test, expect } from '@playwright/test';
import { blockAds } from '../../helpers/ads';
import { trackEndpoints, type TrackedEndpoint } from '../../helpers/network';
import { PROFILE_STATE_PATH } from '../../helpers/auth-state';

// Functional clips for the logged-in account area. Login happens in the setup
// project via an unrecorded context (see tests/setup/auth.setup.ts), so every
// video opens already logged in — the login flow is never on camera.
// Tests are non-destructive (never delete the shared profile user) and safe
// to run in parallel: each test gets a fresh context from the state file.

test.describe('Profile summary', () => {
  test.use({ storageState: PROFILE_STATE_PATH });

  test.beforeEach(async ({ page }) => {
    await blockAds(page);
  });

  test(
    'verify logged in',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'account' },
        { type: 'order', description: 'account:1' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open home page while logged in', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/');
      await expect(page.getByText(/logged in as/i)).toBeVisible();
    });

    await test.step('Verify account links are shown', async () => {
      await expect(page.getByRole('link', { name: /logout/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /delete account/i })).toBeVisible();
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });

  test(
    'logout',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'account' },
        { type: 'order', description: 'account:2' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open home page while logged in', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/');
      await expect(page.getByText(/logged in as/i)).toBeVisible();
    });

    await test.step('Log out and verify login page', async () => {
      await page.getByRole('link', { name: /logout/i }).click();
      await expect(page).toHaveURL(/login/);
      await expect(page.getByText('Login to your account')).toBeVisible();
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });
});
