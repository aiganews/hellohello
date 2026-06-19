# HelloHello — Cloud Agent Instructions

This repository includes Cursor automation agents for CI triage, autofix, and PR review.

## Environment

- Node.js 18+ / 20+
- Install: `npm ci`
- Test: `npm test` (uses in-memory Mongo when `NODE_ENV=test`)
- Local prod-style run: `npm run start:local:prod`
- Dev server: `npm run dev`

## Automation definitions

Repo-side automation specs live in `.cursor/automations/`:

| File | Purpose |
|------|---------|
| `triage-ci-failure.yaml` | Comment on PR when CI fails |
| `autofix-ci-failure.yaml` | Attempt minimal CI fix |
| `pr-code-review.yaml` | Review PR diffs |
| `pr-test-coverage.yaml` | Check test coverage gaps |

GitHub Actions workflows that run these agents:

| Workflow | Trigger |
|----------|---------|
| `.github/workflows/automation-agents.yml` | PR opened/updated |
| `.github/workflows/fix-ci.yml` | CI workflow failure |

## Secrets

- `CURSOR_API_KEY` — required for GitHub Actions CLI agents ([Cursor dashboard](https://cursor.com/dashboard))
- App secrets (Stripe, MongoDB, etc.) — configure in [Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents), not in git

## Conventions

- API routes under `/v1` in `src/app.js`
- Data layer in `src/data.js`
- OpenAPI spec: `docs/api/openapi.yaml`
- Keep changes minimal; run `npm test` before finishing
