import type { Page } from '@playwright/test';

// Third-party ad/tracker hosts blocked on every test page.
// Keeps runs deterministic and library videos free of flashing ad slots.
// Same-origin promo popups are NOT covered here — specs dodge those
// with direct page.goto() navigation instead of header clicks.
const AD_HOSTS = [
  'googlesyndication.com',
  'doubleclick.net',
  'googleadservices.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'ads.yahoo.com',
];

export async function blockAds(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (AD_HOSTS.some((host) => url.includes(host))) {
      return route.abort();
    }
    return route.continue();
  });
}
