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
  functional/           # NEW: functional tests, one folder per app, each test() = one clip
    cart/cart.spec.ts         # describe('Cart summary'): add, update-qty, remove
    product/product.spec.ts   # describe('Product detail summary'): details, add, reviews ×2
    product/fixtures/         # saved product HTML (base + with-reviews variants)
    profile/profile.spec.ts   # describe('Profile summary'): logged-in, logout
  setup/
    auth.setup.ts           # setup project: logged-in storageState, video off (see §4)
  helpers/
    ads.ts              # unchanged
    network.ts          # unchanged
    auth-state.ts       # shared PROFILE_STATE_PATH constant
```

Rules:

- `tests/e2e/**` runs on every PR (`video: retain-on-failure`), never uploaded.
- `tests/functional/**` runs only in `video-library.yml` (`video: on`) + locally via
  `LIBRARY_RUN=1 npx playwright test tests/functional`.
- Library specs forbidden from calling `browser.newContext()` (dodges the
  multi-context video bug — see §7 spike). One `page` per test.

## 3. Functional coverage (automationexercise.com stand-ins)

Real-life shape: `functional/<app>/<app>.spec.ts` holds all functional tests for
that app. Each `test()` is one short clip (5–30s, 1–3 steps). Playwright records
per test, so one file yields N videos — grouping by file loses no granularity.
Only tests tagged `{ type: 'library' }` are recorded to the manifest; workflow
membership is a second tag, so one clip can belong to several flows.

The reviewer's domain example (Job Uploaded → Quoting → Review → Confirm) maps to:

| File | Tests (each = one clip) | Starts at | In workflows |
|------|-------------------------|-------------|--------------|
| `tests/functional/cart/cart.spec.ts` (`describe('Cart summary')`) | add Blue Top to cart; **update quantity**; remove item | `/products` or `/view_cart` with 1 item, guest | new order (add, update) |
| `tests/functional/profile/profile.spec.ts` (`describe('Profile summary')`) | verify logged in; logout | `/` (logged in via setup state) | account |
| `tests/functional/product/product.spec.ts` (`describe('Product detail summary')`) | verify item details; verify add to cart button; verify reviews; verify empty reviews | `/product_details/1` (document mocked, rest live) | new order (details, add) |

Example — the "modify quantity" case is its own test, not a chapter:

```ts
test('update quantity', {
  annotation: [
    { type: 'library' },
    { type: 'workflow', description: 'new order' },
    { type: 'order', description: '4' },
  ],
},
  async ({ page }) => {
    await test.step('Change quantity to 2 and verify total', async () => { ... });
  });
```

Searcher for "modify quantity" gets this 15s clip directly.

Dashboard naming: the reporter builds dashboard titles from the describe path
(`Product detail summary › verify add to cart button`) and records `feature`
(top-level describe), so identical test names across files stay unambiguous.
IDs include the describe slugs; the project suite is excluded (hit 2026-10-13:
`chromium ›` leaked into every title). The viewer has a feature filter row and
searches feature text. Card titles suppress a leading `verify ` prefix
(`verify add to cart button` → `add to cart button`); manifest keeps full titles
for search. Rebuilt IDs orphan old manifest entries — rebuild the
manifest fresh (delete + recapture) after renaming describes.

Mocked functionals (pattern from the product repos, adapted 2026-10-13): the
demo site is fully server-rendered (product page = one document, zero API
calls, verified by probe), so `tests/functional/product.spec.ts` mocks at the
document level — `beforeEach` installs `route.fulfill` with saved HTML fixtures
(`tests/functional/fixtures/`: base + with-reviews variant), everything else
stays live. Fixtures drift if the site changes; re-capture the base HTML
manually when assertions break.

Each test uses deterministic data (fixed product id `1` = Blue Top, test card
`4111111111111111`) so narration is stable. Cleanup (delete account) happens in
`auth-setup` teardown, **not on camera**.

Current monoliths decompose as:

- `register.spec.ts` (7 steps) → kept in `e2e/`; library gets **no** register video
  (registration is a one-off, low training reuse).
- `checkout.spec.ts` (7 steps: register + search + add + address + place + pay + cleanup)
  → split into the `search` / `cart` / `checkout` tests above. Register/cleanup steps are cut from camera.

## 4. Production value: start in place, act human

~~`tests/helpers/training.ts` (slowType/pace)~~ — dropped 2026-10-13: action
timing was fine without it; revisit only if clips look robotic.

New `tests/setup/auth.setup.ts` (setup project, `dependencies: ['setup']` on chromium):

- One setup spec registers/logs in once (reuses saved session when still valid),
  writes `test-results/.auth/profile.json`. Runs with `video: off`.
- Library specs use `test.use({ storageState })` so video
  opens **already logged in, on the task page** — no login preamble.
- `scripts/build-manifest.js` skips `tests/setup/` records: setup is never a library entry.
- Gotcha (hit 2026-10-13): `test.use({ storageState })` with a missing file poisons
  even raw `chromium.launch()` contexts in that file — hence setup project instead
  of beforeAll login. Never create the state lazily inside a consuming spec file.
- Why not login in `beforeEach` (decided 2026-10-13): `beforeEach` runs inside the
  test's recorded context, so every clip would open with ~15s of login preamble —
  the exact thing setup exists to remove. It also costs one login per test instead
  of one per run, and parallel workers would race account creation (unique emails
  per test + throwaway-account litter). Exception: destructive tests (delete/mutate
  account) need their own account — those register in-test and accept the preamble
  as honest content instead of using shared state.
- Fixed viewport `1280x720` (already in config), highlights stay off.

Normal CI (`LIBRARY_RUN` unset) uses `fill()` fast path — zero slowdown.

## 5. Reporter + manifest (v3)

`lib/video-reporter.ts`:

- **Opt-in gate**: writes a record only for tests tagged `{ type: 'library' }`.
  Untagged tests (e2e, setup, experiments) produce no JSON, so a touched file
  only (re)publishes its tagged tests — and building after an e2e run can never
  resurrect e2e entries (verified 2026-10-14). Removing a tag leaves a stale
  manifest entry behind (merge never deletes) — prune manually.
- describe-aware `title`/`feature`/`id` (project suite excluded);
- `workflow` + `order` annotations → flow membership and position.

`scripts/build-manifest.js`: schema `v: 3`:

```json
{
  "v": 3,
  "id": "cart-cart-summary-update-quantity",
  "title": "Cart summary › update quantity",
  "feature": "Cart summary",
  "file": "tests/functional/cart/cart.spec.ts",
  "video": "library/videos/cart-cart-summary-update-quantity.webm",
  "clip": true,
  "durationMs": 4000,
  "workflows": ["new order"],
  "playlistOrder": 4,
  "summary": "AI 3 bullets…",
  "tags": ["cart", "quantity"],
  "searchText": "…"
}
```

Notes: granularity comes from test boundaries, not post-processing (no ffmpeg
slicing, no per-step files). `topic`/`useContext` taxonomy dropped 2026-10-14:
the app folder already groups clips; flows carry reuse.

`viewer/index.html` delta (no framework):

- app chips (parent folder: cart / product / profile) — the only filter;
- flows row: pre-defined flows (`new order`, `account`) stitch member clips
  across apps, ordered by `playlistOrder`;
- card: test name (leading `verify ` suppressed), feature line, video, steps,
  endpoints, `recorded: <date>` footer (no badges, no `Part of` line).

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
- [x] add `tests/functional/cart/cart.spec.ts` (add / update-qty / remove)
- [x] add `tests/setup/auth.setup.ts` + `tests/functional/profile/profile.spec.ts` (login off camera via setup project, `video: off`, filtered from manifest)
- [x] describe-aware dashboard titles + `feature` filter (project suite excluded)
- [x] add `tests/functional/product/product.spec.ts` (mocked `describe('Product detail summary')` + HTML fixtures, replicates product-repo pattern)
- [x] opt-in `library` tag gate + `workflow`/`order` annotations; manifest v3 (`workflows`); viewer app chips + flows row (`new order`, `account`)
- [ ] S3 paths → `latest/` + `releases/`; lifecycle 30d; document promotion
- [ ] record `update quantity` clip, mock search/add/pay manifest entries for pitch
