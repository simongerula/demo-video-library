# PLAN-V2 — Functional Video Library (supersedes E2E-capture in PLAN.md)

## 0. Why V2

Review feedback on PLAN.md concluded: E2E recordings make bad training content
(long, brittle, multi-user, no narrative control). V2 captures **small functional
slices, single user context**, and stitches full workflows as **playlists** in the viewer.

V1 (PLAN.md) stays valid for infra (reporter, manifest merge, viewer, S3 sync).
V2 changes **what we capture and how we present it**. No code changes yet —
this doc is the approval basis.

## 1. Principles

1. One video = one test, one user, one context. One file = one page/feature holding many tests. No multi-context library tests.
2. E2E stays in normal CI for correctness; library tests exist for teaching.
3. Training mode is opt-in (`LIBRARY_RUN=1`): slow, narratable, skips preamble.
4. Reuse over duplication: one video, many playlists via `useContext` tags.
5. Clips first-class: each test is a short standalone clip (5–30s). Long narratives are playlists stitching clips, not long videos. In-clip chapters are secondary.
6. `latest/` is live; `releases/` is archive. Promotion is a copy, rollback is a copy.

## 2. Layout change

```
tests/
  e2e/                  # correctness, fast, existing suite moves here
    auth/register.spec.ts        # moved from tests/auth/
    cart/checkout.spec.ts        # moved from tests/cart/, keep as-is for CI
  library/              # NEW: functional tests, one file per page, each test() = one clip
    search.spec.ts        # describe('search'): search, filter, sort (~3 tests)
    cart.spec.ts          # describe('cart'): add, update-qty, remove-item (~3-4 tests)
    checkout.spec.ts      # describe('checkout'): address step, payment step (~2 tests)
    contact.spec.ts       # describe('contact-us'): fill + upload (~1-2 tests)
  helpers/
    ads.ts              # unchanged
    network.ts          # unchanged
    training.ts         # NEW: LIBRARY_RUN-only helpers (slowType, pace)
    auth-setup.ts       # NEW: storageState fixture (see §4)
```

Rules:

- `tests/e2e/**` runs on every PR (`video: retain-on-failure`), never uploaded.
- `tests/functional/**` runs only in `video-library.yml` (`video: on`) + locally via
  `LIBRARY_RUN=1 npx playwright test tests/functional`.
- Library specs forbidden from calling `browser.newContext()` (dodges the
  multi-context video bug — see §7 spike). One `page` per test.

## 3. Functional coverage (automationexercise.com stand-ins)

Real-life shape: `functional/<page>.spec.ts` holds all functional tests for that
page. Each `test()` is one short clip (5–30s, 1–3 steps). Playwright records
per test, so one file yields N videos — grouping by file loses no granularity.

The reviewer's domain example (Job Uploaded → Quoting → Review → Confirm) maps to:

| File | Tests (each = one clip) | Starts at (already logged in) | In playlists |
|------|-------------------------|-------------------------------|--------------|
| `tests/functional/search.spec.ts` | search Blue Top; filter results; sort results | `/products` | browse, checkout-story, support-story |
| `tests/functional/cart.spec.ts` | add Blue Top to cart; **update quantity**; remove item | `/products` or `/view_cart` with 1 item | checkout-story, cart-help |
| `tests/functional/checkout.spec.ts` | verify address step; pay with test card | `/view_cart` / `/payment` (via setup) | checkout-story, payments-help |
| `tests/functional/contact.spec.ts` | submit contact form with upload | `/contact_us` | support-story |

Example — the "modify quantity" case is its own test, not a chapter:

```ts
test('update quantity', { annotation: [{ type: 'useContext', description: 'cart-help' }] },
  async ({ page }) => {
    await test.step('Change quantity to 2 and verify total', async () => { ... });
  });
```

Searcher for "modify quantity" gets this 15s clip directly.

Each test uses deterministic data (fixed product id `1` = Blue Top, test card
`4111111111111111`) so narration is stable. Cleanup (delete account) happens in
`auth-setup` teardown, **not on camera**.

Current monoliths decompose as:

- `register.spec.ts` (7 steps) → kept in `e2e/`; library gets **no** register video
  (registration is a one-off, low training reuse).
- `checkout.spec.ts` (7 steps: register + search + add + address + place + pay + cleanup)
  → split into the `search` / `cart` / `checkout` tests above. Register/cleanup steps are cut from camera.

## 4. Production value: start in place, act human

New `tests/helpers/training.ts` (only active when `LIBRARY_RUN=1`):

```ts
// slowType(page.locator('#search_product'), 'Blue Top') → type() with 40-60ms delay
// pace() → 300-500ms pause between test.steps for chapter readability
// libraryStep(title, fn) → test.step + test.slow() + pace()
```

New `tests/helpers/auth-setup.ts`:

- Playwright `storageState` project: one setup spec registers/logins once,
  writes `test-results/.auth/user.json`.
- Library specs use `storageState: 'test-results/.auth/user.json'` so video
  opens **already logged in, on the task page** — no login preamble.
- Fixed viewport `1280x720` (already in config), highlights stay off.

Normal CI (`LIBRARY_RUN` unset) uses `fill()` fast path — zero slowdown.

## 5. Reporter + manifest (v2 delta)

`lib/video-reporter.ts`: **no logic change for V2** except:

- fail loudly if >1 video attachment (enforces single-context rule);
- pass through `annotations` (`useContext`, `playlist`) from `test.info()`.

`scripts/build-manifest.js`: schema `v: 2`, additive fields:

```json
{
  "v": 2,
  "id": "cart-update-quantity",
  "title": "Update quantity",
  "file": "tests/functional/cart.spec.ts",
  "video": "library/videos/cart-update-quantity.webm",
  "clip": true,
  "durationMs": 15000,
  "useContext": ["cart-help"],
  "playlists": ["checkout-story"],
  "playlistOrder": 3,
  "summary": "AI 3 bullets…",
  "tags": ["cart", "quantity"],
  "searchText": "…"
}
```

Notes: `clip: true` + `durationMs` let the viewer rank short answers first;
`chapters` field dropped — with 1–3 steps per test there is nothing to chapter.
No ffmpeg slicing: granularity comes from test boundaries, not post-processing.

`viewer/index.html` delta (no framework):

- playlist filter (from `playlists`/`useContext`) alongside existing section chips;
- "Shorts (<30s)" toggle + duration badge so how-to queries surface clips above tasks;
- entry card shows `useContext` badges so one clip visibly serves many stories.

## 6. S3 + promotion (future state, document now, build latest-only)

```
s3://<bucket>/latest/library/manifest.json
s3://<bucket>/latest/library/videos/<test-id>.webm
s3://<bucket>/latest/viewer/index.html
s3://<bucket>/releases/<yyyy-mm-dd>-<sha>/library/…   # archive copy
```

- Training site reads only `latest/`.
- Retention: lifecycle rule deletes `releases/*` after 30 days (was 90d in V1).
- Rollback = `aws s3 cp releases/<good>/ latest/ --recursive`.
- Promotion (review before live): capture writes to `staging/`, human approves,
  workflow copies to `latest/`. **Not built for demo** — MVP writes `latest/` directly.

## 7. CI split (unchanged direction, smaller trigger)

- `e2e.yml`: on PR, `tests/e2e/**`, `video: retain-on-failure`, no upload.
- `video-library.yml`: on `push: main, paths: tests/functional/**` + `workflow_dispatch`,
  runs library specs with `LIBRARY_RUN=1`, syncs `latest/` + snapshot `releases/`.
- PR diff-check ("does this PR need video updates?") and scheduled recapture are
  **roadmap**, not MVP. `workflow_dispatch` covers bad-video recapture.

Spikes (timeboxed):

1. **Multi-context** (1pt): test with 2 contexts → confirm reporter sees 0/2 videos → lock single-context rule.
2. ~~Per-step ffmpeg slicing~~ — cancelled: test-per-clip replaces it. Remaining question is granularity (how small is too small), settled by building `cart.spec.ts` first.

## 8. MVP (2-hour prep order)

1. `LIBRARY_RUN=1` proves one clip locally (`cart.spec.ts` → `update quantity`).
2. One real clip → S3 `latest/` → viewer plays it.
3. Mock the rest: hand-write 3–4 manifest entries (search, add, pay) pointing at the one
   real `.webm` (or manual capture labeled `placeholder: true`) to demo search + playlists.
4. Polish only if time: real search/add captures, Copilot summaries, Slack post.

Manual screen-capture fallback is allowed **only** as labeled placeholders —
never presented as Playwright output.

## 9. Risks

- automationexercise.com flakiness → pin `retries: 1`, explicit expects, direct `goto` over header clicks (existing pattern).
- storageState brittleness (site has no stable test user) → setup project recreates user per run; quota is fine for demo scale.
- Granularity: too many micro-tests become maintenance burden → start with `cart.spec.ts` (add / update-qty / remove), add more pages on demand.
- Chapter timestamps dropped with clips model — no frame-accuracy promise to keep.

## 10. Next steps (no code until approved)

- [x] move `tests/auth/*` → `tests/e2e/auth/*`, `tests/cart/*` → `tests/e2e/cart/*`
- [x] add `tests/functional/cart.spec.ts` (add / update-qty / remove)
- [ ] reporter: error on >1 video; manifest v2 fields (`clip`, `playlists`); viewer playlists + Shorts filter
- [ ] S3 paths → `latest/` + `releases/`; lifecycle 30d; document promotion
- [ ] record `update quantity` clip, mock search/add/pay manifest entries for pitch
