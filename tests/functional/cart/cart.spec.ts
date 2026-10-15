import { test, expect } from '@playwright/test';
import { blockAds } from '../../helpers/ads';
import { trackEndpoints, type TrackedEndpoint } from '../../helpers/network';

// Functional clips for the cart page: every clip opens on /view_cart.
// The cart is seeded invisibly via API in beforeEach (no navigation, so the
// video starts on the cart page) — each test gets a fresh seeded context.

test.describe('Cart summary', () => {
  test.beforeEach(async ({ page }) => {
    await blockAds(page);
    await page.request.get('/add_to_cart/1');
  });

  test(
    'verify cart details displayed',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'new order' },
        { type: 'order', description: 'new order:3' },
        { type: 'workflow', description: 'cancel order' },
        { type: 'order', description: 'cancel order:2' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open cart with seeded Blue Top', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/view_cart');
      await expect(page.locator('#cart_info')).toContainText('Blue Top');
    });

    await test.step('Verify price and total', async () => {
      const row = page.locator('#cart_info tr', { hasText: 'Blue Top' });
      await expect(row).toContainText('Rs. 500');
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });

  test(
    'remove item from cart',
    {
      annotation: [
        { type: 'library' },
        { type: 'workflow', description: 'cancel order' },
        { type: 'order', description: 'cancel order:3' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open cart with seeded Blue Top', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/view_cart');
      await expect(page.locator('#cart_info')).toContainText('Blue Top');
    });

    await test.step('Remove Blue Top and verify cart is empty', async () => {
      await page.locator('a.cart_quantity_delete[data-product-id="1"]').first().click();
      await expect(page.getByText(/cart is empty/i)).toBeVisible();
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });
});
