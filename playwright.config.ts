import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  testIdAttribute: 'data-qa',
  reporter: [['list', { printSteps: true }]],
  use: {
    baseURL: 'https://www.automationexercise.com',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
