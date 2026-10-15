import { test, expect } from '@playwright/test';
import { blockAds } from '../../helpers/ads';
import { trackEndpoints, type TrackedEndpoint } from '../../helpers/network';
import { PROFILE_STATE_PATH } from '../../helpers/auth-state';

// Functional clips for the checkout pages: logged in (setup storage state)
// with the cart seeded invisibly via API, so every clip opens directly on
// its page — /checkout or /payment. No users or orders are cleaned up;
// the shared profile user simply accumulates demo orders.

test.describe('Checkout summary', () => {
  test.use({ storageState: PROFILE_STATE_PATH });

  test.beforeEach(async ({ page }) => {
    await blockAds(page);
    await page.request.get('/add_to_cart/1');
  });

  test(
    'verify address details',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'new order' },
        { type: 'order', description: 'new order:4' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open checkout with seeded cart', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/checkout');
      await expect(page.getByText('Address Details')).toBeVisible();
    });

    await test.step('Verify delivery address and order review', async () => {
      await expect(page.getByText(/review your order/i)).toBeVisible();
      await expect(page.locator('#cart_info')).toContainText('Blue Top');
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });

  test(
    'place order',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'new order' },
        { type: 'order', description: 'new order:5' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open checkout with seeded cart', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/checkout');
      await expect(page.getByText('Address Details')).toBeVisible();
    });

    await test.step('Comment and place order', async () => {
      await page.locator('textarea[name="message"]').fill('Please deliver quickly');
      await page.getByRole('link', { name: /place order/i }).click();
      await expect(page).toHaveURL(/payment/);
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });

  test(
    'pay with test card',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'new order' },
        { type: 'order', description: 'new order:6' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open payment page', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/payment');
      await expect(page.locator('[data-qa="card-number"]')).toBeVisible();
    });

    await test.step('Pay with test card and verify success', async () => {
      await page.locator('[data-qa="name-on-card"]').fill('Demo User');
      await page.locator('[data-qa="card-number"]').fill('4111111111111111');
      await page.locator('[data-qa="cvc"]').fill('311');
      await page.locator('[data-qa="expiry-month"]').fill('12');
      await page.locator('[data-qa="expiry-year"]').fill('2030');
      await page.locator('[data-qa="pay-button"]').click();
      await expect(page.getByText(/order placed|congratulations/i).first()).toBeVisible();
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });
});
