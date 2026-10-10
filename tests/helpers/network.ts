import type { Page } from '@playwright/test';

export type TrackedEndpoint = {
  method: string;
  path: string;
};

const STATIC_EXTENSIONS = [
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.map',
];

// Records same-origin document/fetch/XHR requests so the library can show
// (and agents can read) which endpoints a flow consumes. Static assets and
// third-party hosts are ignored. Returns a stop function with the deduped list.
export function trackEndpoints(page: Page): () => TrackedEndpoint[] {
  const seen = new Map<string, TrackedEndpoint>();
  // page.url() is about:blank before the first navigation, so learn the
  // origin from the first document request instead of reading it up front.
  let origin: string | null = null;

  page.on('request', (request) => {
    if (!['document', 'fetch', 'xhr'].includes(request.resourceType())) return;
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (request.resourceType() === 'document' && !origin) {
      origin = url.origin;
    }
    if (!origin || url.origin !== origin) return;
    if (STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) return;
    if (url.pathname.startsWith('/cdn-cgi/')) return; // Cloudflare beacon, not app traffic
    if (request.method() === 'GET' && url.pathname === '/') return; // home page hit, noise in every flow
    const key = `${request.method()} ${url.pathname}`;
    if (!seen.has(key)) {
      seen.set(key, { method: request.method(), path: url.pathname });
    }
  });

  return () => [...seen.values()];
}
