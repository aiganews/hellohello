# Code Review Merge Agent

The Code Review Merge Agent is a GitHub Actions workflow that reviews pull requests after CI succeeds and queues safe candidates for merge into `main`.

Workflow file:

- `.github/workflows/code-review-merge-agent.yml`

## Operating model

1. The `CI` workflow runs on pull requests.
2. When `CI` completes successfully, the agent locates the open pull request for the successful commit.
3. The agent reviews changed files through the GitHub API without checking out or executing pull request code.
4. The agent comments with either a blocked result or an automerge approval result.
5. If all guardrails pass, the agent runs GitHub automerge for the pull request.

## Required labels

- `agent:auto-merge` is required before the agent will queue a pull request for merge.
- `agent:workflow-change-approved` is also required when a pull request changes `.github/workflows/**`.

These labels keep automatic merge opt-in and make workflow changes explicit.

## Guardrails

The agent blocks automatic merge when:

- The pull request is a draft.
- The pull request does not target `main`.
- The pull request comes from a fork.
- The required `agent:auto-merge` label is missing.
- A workflow file changed without `agent:workflow-change-approved`.
- Sensitive-looking files are changed, such as `.env`, `secrets.json`, `*.pem`, `*.p12`, `*.pfx`, or `*.key`.
- Secret-looking content appears in the patch, including AWS access keys, private keys, MongoDB credentials, Stripe secret keys, Telnyx API keys, or token secret assignments.

## Repository settings expected

Keep branch protection enabled for `main` with required checks from `CI`. The agent queues automerge; it should not be used as a branch-protection bypass.

If GitHub automerge is disabled for the repository, the final merge step will fail safely and leave the pull request open.
