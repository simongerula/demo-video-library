import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  testIdAttribute: 'data-qa',
  reporter: [
    ['list', { printSteps: true }],
    ['./lib/video-reporter.ts', { outputDir: 'test-results/video-meta' }],
  ],
  use: {
    baseURL: 'https://www.automationexercise.com',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: {
      mode: process.env.LIBRARY_RUN ? 'on' : 'retain-on-failure',
      show: {
        actions: {
          duration: 700,
          position: 'top-right',
          fontSize: 14,
          style: { title: 'display: none', highlight: 'display: none' },
        },
      },
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
