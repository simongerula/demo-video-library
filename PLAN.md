# Demo Video Library — E2E Video Knowledge Base

Hackathon idea: turn Playwright e2e runs into a searchable video knowledge base for devs / product / QA.

Every time an e2e test is updated and merged, CI re-runs it with video recording, uploads the video to S3, extracts `test.step()` descriptions + AI summary, and publishes it to a simple searchable guide page.

New joiner searches e.g. "change password" -> gets video + step summary showing how the flow looks.

## 1. Core Loop

```
Playwright e2e (with test.step) -> video.webm + steps.json
  -> GitHub Actions (trigger: push to main, paths: tests/**)
  -> AI summary (GitHub Copilot SDK)
  -> S3: /videos/<spec>/<sha>.webm + manifest.json
  -> Static viewer (index.html) reads manifest.json: search + play
  -> Slack notification: new/updated flow published
```

Principle: don't AI-analyze video pixels. Use `test.step()` titles as ground truth. AI only summarizes / tags / makes searchable.

## 2. Demo Scope (this folder)

Local-first demo to validate before proposing as real project.

New repo to create on GitHub, Playwright tests against https://www.automationexercise.com, plus pipeline design + S3 design on paper, then real S3 wiring.

Starter scenarios (stable + visual):
1. Register new user
2. Login + add to cart
3. Checkout flow

Later: change password, contact us, product search.

## 3. Repo Layout

```
demo-video-library/
  playwright.config.ts      # use: { video: 'on' }
  tests/
    auth/register.spec.ts
    auth/login-cart.spec.ts       # re-add later to test merge workflow
    cart/checkout.spec.ts         # re-add later to test merge workflow
  lib/
    video-reporter.ts       # custom reporter: onStepBegin/End, onTestEnd captures video path
  scripts/
    build-manifest.js       # merge reporter JSON -> library/manifest.json
    summarize-with-copilot.js
    notify-slack.js
  library/
    manifest.json
    videos/                 # gitignored locally, uploaded to S3 in CI
  viewer/
    index.html              # search + <video> + steps, fetches manifest.json
  .github/workflows/
    e2e.yml                 # normal PR check, video: retain-on-failure
    video-library.yml       # push to main + paths tests/**, video: on, upload to S3
  infra/
    s3-policy.json
  PLAN.md                   # this file
```

## 4. Playwright Conventions

Required test discipline:

```ts
await test.step('Go to login page', async () => { ... });
await test.step('Fill email and submit', async () => { ... });
await test.step('Add Blue Top to cart', async () => { ... });
```

Config:

```ts
// playwright.config.ts
use: {
  video: 'on', // library workflow forces 'on', PR workflow uses 'retain-on-failure'
  trace: 'off',
}
```

Custom reporter (`lib/video-reporter.ts`):
- implements `onStepBegin / onStepEnd` — collect only `step.category === 'test.step'`, store title, titlePath, duration
- implements `onTestEnd(test, result)` — get video from `result.attachments.find(a => a.contentType?.startsWith('video'))`, plus test title, file, status, retry
- writes `test-results/video-meta/<spec>.json`
- `build-manifest.js` merges into `library/manifest.json`:

```json
{
  "id": "auth-login",
  "title": "Login + add to cart",
  "file": "tests/auth.login.spec.ts",
  "video": "videos/auth-login/abc1234.webm",
  "commit": "abc1234",
  "runUrl": "https://github.com/org/repo/actions/runs/123",
  "updatedAt": "2026-10-09T00:00:00Z",
  "steps": ["Go to login page", "Fill email..."],
  "summary": "AI 3-bullet summary...",
  "tags": ["login", "cart"],
  "searchText": "login add to cart blue top..."
}
```

Video size guard: `video: { mode: 'on', size: { width: 1280, height: 720 } }`, keep tests < 60s, `test.slow()` where needed.

## 5. GitHub Actions Design

Two workflows to avoid slowing normal PRs:

### a) `e2e.yml` — existing flow, unchanged
- on: pull_request, push to main
- runs full suite, `video: retain-on-failure`
- no upload to library

### b) `video-library.yml` — new
- on:
  ```yaml
  push:
    branches: [main]
    paths: ['tests/**', 'playwright.config.ts']
  workflow_dispatch:
  ```
- jobs:
  1. detect-changed-specs (dorny/paths-filter or git diff)
  2. run-playwright `--reporter=./lib/video-reporter.ts` with `video: on`
  3. `node scripts/summarize-with-copilot.js`
  4. `aws s3 sync library/ s3://<bucket>/`
  5. `node scripts/notify-slack.js` (only if new/updated entries)
  6. invalidate CloudFront (if used)

Needs `GH_TOKEN` with Copilot access + Copilot CLI on runner, and AWS OIDC role (no long-lived keys).

### c) Future extraction: reusable workflow for other repos

Demo builds everything repo-local for speed. For org rollout, extract without forking logic:

- Package: `lib/video-reporter.ts` + `scripts/build-manifest.js` become `@company/playwright-video-library` (or copy-paste unit). Rules: no spec names, no bucket, no Slack inside — config via reporter options / CLI args / env only. `manifest.json` schema versioned (`v: 1`).
- Central repo: `company/e2e-video-library` with `.github/workflows/capture.yml` (`on: workflow_call`, inputs: `tests-path`, `bucket`, `role-to-assume`, `viewer-origin`). It checks out caller, runs Playwright with the packaged reporter, syncs to S3, posts Slack.
- Consumer repo then needs ~10 lines:
  ```yaml
  jobs:
    library:
      uses: company/e2e-video-library/.github/workflows/capture.yml@main
      with: { tests-path: 'tests/**', bucket: 'e2e-library-prod' }
      secrets: inherit
  ```
- Tradeoffs: one place to maintain vs versioning + OIDC trust per caller repo + harder local debug. Decision: stay repo-local for hackathon, extract on second adopter.
- OIDC gotcha (hit 2026-10-09, keep for rollout): GitHub's OIDC `sub` now embeds numeric IDs — `repo:{owner}@{ownerId}/{repo}@{repoId}:ref:refs/heads/<branch>` (e.g. `repo:simongerula@52640978/demo-video-library@1411117042:ref:refs/heads/master`). Old tutorials showing `repo:OWNER/REPO:*` will fail with `Not authorized to perform sts:AssumeRoleWithWebIdentity`. For each consumer repo: add a temporary claims-debug step (decode the JWT `sub`), paste the exact IDs into the role trust, and use a branch-wildcard (`...@repoId:*`) unless you want branch-pinning. Also: no `_comment` keys inside IAM `Condition` blocks (IAM rejects them), and workflow-file-only pushes don't match `paths: tests/**` — use `workflow_dispatch` to test.

## 6. AWS S3 + Page Design (real bucket)

- Bucket: `demo-video-library-simongerula` (`ap-southeast-2`), private, versioning off
- Layout:
  - `s3://bucket/videos/<spec-name>/<short-sha>.webm`
  - `s3://bucket/manifest.json`
  - `s3://bucket/index.html` (same bucket or separate static site bucket)
- Hosting: S3 static hosting for demo, CloudFront + OAC for real proposal
- Lifecycle rule: delete `videos/*` older than 90d, keep `manifest.json` history
- Auth in CI: OIDC
  ```yaml
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::ACCOUNT:role/e2e-video-uploader
      aws-region: ap-southeast-2
  ```
- Cost: cents for demo. Main cost driver is storage + CloudFront egress.

`viewer/index.html` requirements:
- fetch `manifest.json`
- client-side filter by `title + summary + tags + searchText`
- card: `<video controls preload="metadata">` + `<ol>steps</ol>` + summary + commit + run link
- no framework, zero build

## 7. AI Layer (GitHub Copilot)

We have Copilot at work, so use **Copilot SDK** (GA June 2026), not Copilot autocomplete.

- `npm i @github/copilot-sdk` or `pip install github-copilot-sdk`
- SDK drives Copilot CLI agent programmatically, billed to existing Copilot seat, no extra OpenAI key
- Note: GitHub Models inference API was retired July 30, 2026 — do not plan on it
- Fallback if SDK auth fails in CI: Azure AI Foundry / OpenAI-compatible endpoint

`scripts/summarize-with-copilot.js` input -> output:
- in: `{ title, steps[] }`
- prompt: "Summarize in 3 bullets for a new dev, add 5 search tags, guess 3 natural queries that should find this (e.g. change password)"
- out: `{ summary, tags, searchText }` merged into manifest

Local demo starts rule-based (use step titles verbatim), swap in Copilot script for pitch. This proves UX without blocking on AI auth.

Other AI ideas (pick 1-2 for hackathon, rest as roadmap):
1. Semantic search — embed summary once, cosine match client-side so "reset pwd" finds "change password"
2. Auto-chapters — map step start/end times to video timestamps
3. Flaky explainer — feed last step + error to Copilot -> "likely cause"
4. Doc generator — "Export to Confluence markdown" button
5. Test maintainer — "This UI changed, suggest updated selectors" from failure + video

## 8. Slack Integration — New Flow Published

Goal: easier knowledge share. Every new/updated video posts to Slack so team discovers flows without opening the library.

Channel: e.g. `#e2e-demos` or `#product-flows`.

Trigger: end of `video-library.yml`, only if `manifest.json` diff has added/updated entries.

Message format (Block Kit):
- header: `:movie_camera: New flow: Login + add to cart`
- fields: spec file, commit + author, run link, duration
- summary (AI, 3 bullets)
- steps preview (first 5 + "…+3 more")
- buttons: `Watch video` (S3/CloudFront URL), `Open library`, `View run`
- thread: full step list

Implementation options:
- Simple: Slack Incoming Webhook (`SLACK_WEBHOOK_URL` secret) + `scripts/notify-slack.js` posts JSON. Enough for demo.
- Real: Slack App with `chat.postMessage`, channel ID in secret, richer unfurls + emoji reactions for feedback (`:+1: useful`, `:eyes: outdated`).

Dedup rules:
- post only on `main` pushes, not PRs
- one post per spec per run, group 3 specs into single summary post if same commit
- update same thread on re-run of same SHA, don't spam
- opt-out via `tags: ["no-slack"]` or `[skip-slack]` in commit message

Example payload fields built from manifest entry + `github.context`.

Future: Slack slash command `/howto checkout` -> search manifest -> return video link. Good pitch slide, out of MVP scope.

## 9. Risks / Open Questions

- automationexercise.com flaky/slow — pin `retries: 1`, timeouts explicit, keep selectors simple
- Video size in CI — upload straight to S3, don't keep as Actions artifact
- Copilot SDK auth in headless CI — validate early, keep rule-based fallback
- Search relevance — start keyword search, add embeddings only if time
- S3 permissions / OIDC — need AWS admin to create role once
- Maintenance — stale videos when UI changes; show commit date + "last verified" badge

## 10. Hackathon Timeline Suggestion

- T+0-2h: scaffold Playwright + 1 passing test with video + reporter JSON
- T+2-4h: 3 tests + manifest + static index.html search works locally
- T+4-6h: video-library.yml + S3 sync + viewer deployed
- T+6-8h: Copilot summary + Slack webhook post
- Pitch: live search "checkout" -> play video -> show Slack post -> roadmap slide

## 11. Next Steps

- [x] scaffold npm + playwright in this folder
- [x] write specs with test.step discipline (register done, login-cart + checkout to re-add later)
- [x] implement video-reporter.ts + build-manifest.js
- [x] build viewer/index.html
- [ ] create S3 bucket + OIDC role, add secrets
- [ ] add video-library.yml + Slack webhook
- [ ] add summarize-with-copilot.js
- [ ] record demo GIF for pitch
