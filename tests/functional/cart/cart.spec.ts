import { test, expect } from '@playwright/test';
import { blockAds } from '../../helpers/ads';
import { trackEndpoints, type TrackedEndpoint } from '../../helpers/network';

// Functional clips for the cart page: one file, one test per clip.
// Each test is guest-mode (no login), starts in place, and stays <30s on camera.
// Cleanup is navigation only (clear cart), never account deletion.

test.describe('Cart summary', () => {
  test.beforeEach(async ({ page }) => {
    await blockAds(page);
  });

  test(
    'add Blue Top to cart',
    {
      annotation: [
        { type: 'story', description: 'checkout-story' },
        { type: 'topic', description: 'cart-help' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Open products and add Blue Top', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/products');
      await expect(page.getByText('All Products')).toBeVisible();
      await page.locator('.productinfo a[data-product-id="1"]').first().click();
      await expect(page.getByText('Added!')).toBeVisible();
    });

    await test.step('Verify cart contains Blue Top', async () => {
      await page.getByRole('link', { name: /view cart/i }).click();
      await expect(page).toHaveURL(/view_cart/);
      await expect(page.locator('#cart_info')).toContainText('Blue Top');
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });

  test(
    'update quantity',
    {
      annotation: [
        { type: 'story', description: 'checkout-story' },
        { type: 'topic', description: 'cart-help' },
      ],
    },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Set quantity to 2 on Blue Top details', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/product_details/1');
      await expect(page.locator('#quantity')).toBeVisible();
      await page.locator('#quantity').fill('2');
      await page.getByRole('button', { name: /add to cart/i }).click();
      await expect(page.getByText('Added!')).toBeVisible();
    });

    await test.step('Verify cart shows quantity 2', async () => {
      await page.getByRole('link', { name: /view cart/i }).click();
      await expect(page).toHaveURL(/view_cart/);
      const row = page.locator('#cart_info tr', { hasText: 'Blue Top' });
      await expect(row).toContainText('2');
      await test.info().attach('endpoints', {
        body: JSON.stringify(getEndpoints()),
        contentType: 'application/json',
      });
    });
  });

  test(
    'remove item from cart',
    { annotation: [{ type: 'topic', description: 'cart-help' }] },
    async ({ page }) => {
    let getEndpoints: () => TrackedEndpoint[] = () => [];

    await test.step('Add Blue Top to cart', async () => {
      getEndpoints = trackEndpoints(page);
      await page.goto('/products');
      await expect(page.getByText('All Products')).toBeVisible();
      await page.locator('.productinfo a[data-product-id="1"]').first().click();
      await expect(page.getByText('Added!')).toBeVisible();
      await page.getByRole('link', { name: /view cart/i }).click();
      await expect(page).toHaveURL(/view_cart/);
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
