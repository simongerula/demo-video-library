import { test, expect } from '@playwright/test';
import { blockAds } from '../helpers/ads';
import { trackEndpoints, type TrackedEndpoint } from '../helpers/network';

test('Search product and complete checkout', async ({ page }) => {
  const timestamp = Date.now();
  const userName = `buyer${timestamp}`;
  const email = `buyer${timestamp}@example.com`;
  const password = 'Test1234!';
  let getEndpoints: () => TrackedEndpoint[] = () => [];

  await test.step('Register a fresh buyer', async () => {
    getEndpoints = trackEndpoints(page);
    await blockAds(page);
    await page.goto('/login');
    await page.locator('[data-qa="signup-name"]').fill(userName);
    await page.locator('[data-qa="signup-email"]').fill(email);
    await page.locator('[data-qa="signup-button"]').click();
    await expect(page.getByText('Enter Account Information')).toBeVisible();
    await page.locator('#id_gender1').check({ force: true }).catch(() => {});
    await page.locator('[data-qa="password"]').fill(password);
    await page.locator('#days').selectOption('10');
    await page.locator('#months').selectOption('5');
    await page.locator('#years').selectOption('1990');
    await page.locator('[data-qa="first_name"]').fill('Buy');
    await page.locator('[data-qa="last_name"]').fill('Er');
    await page.locator('[data-qa="address"]').fill('123 Demo Street');
    await page.locator('#country').selectOption('United States');
    await page.locator('[data-qa="state"]').fill('California');
    await page.locator('[data-qa="city"]').fill('Los Angeles');
    await page.locator('[data-qa="zipcode"]').fill('90001');
    await page.locator('[data-qa="mobile_number"]').fill('1234567890');
    await page.locator('[data-qa="create-account"]').click();
    await expect(page.locator('[data-qa="account-created"]')).toBeVisible();
    await page.locator('[data-qa="continue-button"]').click();
    await expect(page.getByText(`Logged in as ${userName}`)).toBeVisible();
  });

  await test.step('Search for Blue Top', async () => {
    await page.goto('/products');
    await expect(page.getByText('All Products')).toBeVisible();
    await page.locator('#search_product').fill('Blue Top');
    await page.locator('#submit_search').click();
    await expect(page.getByText('Searched Products')).toBeVisible();
  });

  await test.step('Add searched product to cart', async () => {
    await page.locator('.productinfo a[data-product-id="1"]').first().click();
    await expect(page.getByText('Added!')).toBeVisible();
    await page.getByRole('link', { name: /view cart/i }).click();
    await expect(page).toHaveURL(/view_cart/);
  });

  await test.step('Proceed to checkout and verify address', async () => {
    await expect(page.locator('#cart_info')).toContainText('Blue Top');
    await page.getByText('Proceed To Checkout').click();
    await expect(page.getByText('Address Details')).toBeVisible();
  });

  await test.step('Place order', async () => {
    await page.locator('textarea[name="message"]').fill('Please deliver quickly');
    await page.getByRole('link', { name: /place order/i }).click();
    await expect(page).toHaveURL(/payment/);
  });

  await test.step('Pay with test card', async () => {
    await page.locator('[data-qa="name-on-card"]').fill('Demo User');
    await page.locator('[data-qa="card-number"]').fill('4111111111111111');
    await page.locator('[data-qa="cvc"]').fill('311');
    await page.locator('[data-qa="expiry-month"]').fill('12');
    await page.locator('[data-qa="expiry-year"]').fill('2030');
    await page.locator('[data-qa="pay-button"]').click();
  });

  await test.step('Verify order success and clean up', async () => {
    await expect(page.getByText(/order placed|congratulations/i).first()).toBeVisible();
    await page
      .getByRole('link', { name: /delete account/i })
      .click({ timeout: 8000 })
      .catch(() => page.goto('/delete_account'));
    await expect(page.locator('[data-qa="account-deleted"]')).toBeVisible();
    await page.locator('[data-qa="continue-button"]').click();
    await test.info().attach('endpoints', {
      body: JSON.stringify(getEndpoints()),
      contentType: 'application/json',
    });
  });
});
