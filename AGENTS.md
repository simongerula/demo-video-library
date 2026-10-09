# AGENTS.md - Working Agreement for AI Agents

## 1. Context first

When you receive a prompt, start by reading `PLAN.md` (plus `/docs/*.md` if
present) to get the latest context (architecture, pipeline plan, decisions).
Docs are the source of truth - code second, assumptions never.

## 2. Familiarise

Explore the repo and understand the existing code and logic before touching
anything. Check how the area you will change works today and what depends on it.

## 3. Plan and get approval

Plan the required changes and wait for approval **before** implementing.
Present the plan concisely: what changes, which files, risks/edge cases.
Do not write code until the plan is approved.

## 4. Implement on approval

Once approved, implement the changes. Verify with the relevant checks for this
repo (`npx playwright test`, `node scripts/build-manifest.js`, open
`viewer/index.html`; use `pnpm typecheck` / `pnpm build` only if configured).

## 5. Update docs

Update `PLAN.md` (and `/docs/*.md` when they exist) when your change affects
them (new tests, endpoints, decisions, conventions). Keep docs in sync with
the code.

## 6. No git commands

Do not run git commands - no `add`, `commit`, `push`, `pull`, `checkout`,
`stash`, or similar. Leave committing and pushing to the user.

## 7. Suggest a commit message

After implementation and verification, suggest a short descriptive commit
message for the changes (one line, imperative mood, e.g.
`add video reporter and manifest builder`). The user commits.

## 8. Project conventions and safety

- Playwright tests must use `await test.step('...')` for every user-visible step.
- Viewer is plain static HTML (`viewer/index.html` + `manifest.json`) - no framework.
- Never commit generated videos (`library/videos/`, `test-results/`) or secrets
  (`AWS creds`, `SLACK_WEBHOOK_URL`, `GH_TOKEN`). Use env vars / secrets.
