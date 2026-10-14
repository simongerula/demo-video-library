import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { blockAds } from '../../helpers/ads';
import { trackEndpoints, type TrackedEndpoint } from '../../helpers/network';

// Replicates the mocked-functional pattern from the product repos: beforeEach
// installs HTTP mocks, tests assert UI states. The product page is fully
// server-rendered (single document, no API), so the mock serves saved HTML
// fixtures via route.fulfill — base render plus a reviews variant. Everything
// else (subresources, add-to-cart) stays live, so clips look identical.
const BASE_HTML = fs.readFileSync(
  new URL('./fixtures/product-details.html', import.meta.url),
  'utf8',
);
const WITH_REVIEWS_HTML = fs.readFileSync(
  new URL('./fixtures/product-details-with-reviews.html', import.meta.url),
  'utf8',
);

function mockProduct(page: Page) {
  return page.route('**/product_details/1', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: BASE_HTML }),
  );
}

test.describe('Product detail summary', () => {
  test.beforeEach(async ({ page }) => {
    await blockAds(page);
    await mockProduct(page);
  });

  test(
    'verify item details displayed',
    { annotation: [{ type: 'topic', description: 'product-help' }] },
    async ({ page }) => {
      let getEndpoints: () => TrackedEndpoint[] = () => [];

      await test.step('Open Blue Top details from mock', async () => {
        getEndpoints = trackEndpoints(page);
        await page.goto('/product_details/1');
        await expect(page.getByText('Blue Top').first()).toBeVisible();
      });

      await test.step('Verify price and stock details', async () => {
        await expect(page.getByText('Rs. 500').first()).toBeVisible();
        await expect(page.getByText('In Stock')).toBeVisible();
        await expect(page.getByText('Brand: Polo')).toBeVisible();
        await test.info().attach('endpoints', {
          body: JSON.stringify(getEndpoints()),
          contentType: 'application/json',
        });
      });
    },
  );

  test(
    'verify add to cart button',
    {
      annotation: [
        { type: 'story', description: 'checkout-story' },
        { type: 'topic', description: 'product-help' },
      ],
    },
    async ({ page }) => {
      let getEndpoints: () => TrackedEndpoint[] = () => [];

      await test.step('Open Blue Top details from mock', async () => {
        getEndpoints = trackEndpoints(page);
        await page.goto('/product_details/1');
        await expect(page.getByText('Blue Top').first()).toBeVisible();
      });

      await test.step('Add to cart from mocked details', async () => {
        await page.getByRole('button', { name: /add to cart/i }).click();
        await expect(page.getByText('Added!')).toBeVisible();
        await test.info().attach('endpoints', {
          body: JSON.stringify(getEndpoints()),
          contentType: 'application/json',
        });
      });
    },
  );

  test(
    'verify reviews are displayed',
    { annotation: [{ type: 'topic', description: 'product-help' }] },
    async ({ page }) => {
      let getEndpoints: () => TrackedEndpoint[] = () => [];

      await test.step('Open details with mocked reviews', async () => {
        getEndpoints = trackEndpoints(page);
        await page.unrouteAll({ behavior: 'wait' });
        await page.route('**/product_details/1', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: WITH_REVIEWS_HTML,
          }),
        );
        await page.goto('/product_details/1');
        await expect(page.getByText('Blue Top').first()).toBeVisible();
      });

      await test.step('Verify mocked reviews render', async () => {
        await expect(page.getByText('Customer Reviews')).toBeVisible();
        await expect(page.getByText('Anna K.')).toBeVisible();
        await test.info().attach('endpoints', {
          body: JSON.stringify(getEndpoints()),
          contentType: 'application/json',
        });
      });
    },
  );

  test(
    'verify missing reviews are displayed empty',
    { annotation: [{ type: 'topic', description: 'product-help' }] },
    async ({ page }) => {
      let getEndpoints: () => TrackedEndpoint[] = () => [];

      await test.step('Open details with base mock', async () => {
        getEndpoints = trackEndpoints(page);
        await page.goto('/product_details/1');
        await expect(page.getByText('Blue Top').first()).toBeVisible();
      });

      await test.step('Verify empty reviews state', async () => {
        await expect(page.locator('#reviews-list')).toHaveCount(0);
        await expect(page.locator('#review-form')).toBeVisible();
        await test.info().attach('endpoints', {
          body: JSON.stringify(getEndpoints()),
          contentType: 'application/json',
        });
      });
    },
  );
});
