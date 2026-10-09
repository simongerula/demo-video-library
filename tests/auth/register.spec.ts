import { test, expect } from '@playwright/test';

test('Register new user', async ({ page }) => {
  const timestamp = Date.now();
  const userName = `demo${timestamp}`;
  const email = `demo${timestamp}@example.com`;
  const password = 'Test1234!';

  await test.step('Open home page', async () => {
    await page.goto('/');
    await expect(page.locator('header a:has-text("Home")').first()).toBeVisible();
  });

  await test.step('Go to Signup / Login', async () => {
    await page.getByRole('link', { name: /signup \/ login/i }).click();
    await expect(page.getByText('New User Signup!')).toBeVisible();
  });

  await test.step('Start signup with name and email', async () => {
    await page.locator('[data-qa="signup-name"]').fill(userName);
    await page.locator('[data-qa="signup-email"]').fill(email);
    await page.locator('[data-qa="signup-button"]').click();
    await expect(page.getByText('Enter Account Information')).toBeVisible();
  });

  await test.step('Fill account information', async () => {
    await page.locator('#id_gender1').check({ force: true }).catch(() => {});
    await page.locator('[data-qa="password"]').fill(password);
    await page.locator('#days').selectOption('10');
    await page.locator('#months').selectOption('5');
    await page.locator('#years').selectOption('1990');
  });

  await test.step('Fill address information', async () => {
    await page.locator('[data-qa="first_name"]').fill('Demo');
    await page.locator('[data-qa="last_name"]').fill('User');
    await page.locator('[data-qa="address"]').fill('123 Demo Street');
    await page.locator('#country').selectOption('United States');
    await page.locator('[data-qa="state"]').fill('California');
    await page.locator('[data-qa="city"]').fill('Los Angeles');
    await page.locator('[data-qa="zipcode"]').fill('90001');
    await page.locator('[data-qa="mobile_number"]').fill('1234567890');
    await page.locator('[data-qa="create-account"]').click();
  });

  await test.step('Verify account created and logged in', async () => {
    await expect(page.locator('[data-qa="account-created"]')).toBeVisible();
    await page.locator('[data-qa="continue-button"]').click();
    await expect(page.getByText(`Logged in as ${userName}`)).toBeVisible();
  });

  await test.step('Delete account to clean up', async () => {
    await page.goto('/delete_account');
    await expect(page.locator('[data-qa="account-deleted"]')).toBeVisible();
    await page.locator('[data-qa="continue-button"]').click();
  });
});
