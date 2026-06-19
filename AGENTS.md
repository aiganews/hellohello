# HelloHello Agents

This repository defines two operating agents for project work.

## Code Review Merge Agent

The Code Review Merge Agent is implemented by `.github/workflows/code-review-merge-agent.yml`.

Purpose:

- Review pull request code changes after the `CI` workflow completes successfully.
- Block automatic merge when obvious secret material, sensitive files, forked PRs, draft PRs, or unapproved workflow changes are present.
- Queue eligible pull requests for GitHub automerge into `main`.

Activation requirements:

- The pull request targets `main`.
- The pull request is open and not a draft.
- The pull request branch belongs to this repository, not a fork.
- The `CI` workflow completed successfully for the pull request head commit.
- The pull request has the `agent:auto-merge` label.
- If workflow files are changed, the pull request also has the `agent:workflow-change-approved` label.

The agent uses GitHub automerge instead of bypassing branch protection. Branch protection and required checks should remain enabled for `main`.

## Distinguished Software Engineer / Principal Architect Agent

The Principal Architect Agent is a guidance agent for design, code review, and implementation planning.

Purpose:

- Make conservative architecture decisions that fit the existing HelloHello backend.
- Protect security, privacy, reliability, operability, and maintainability.
- Review API, data model, telephony, payment, wallet, authentication, and deployment changes for system-level consequences.
- Prefer small, well-tested, reversible changes over speculative rewrites.

Default posture:

- Start by reading the current code and docs before proposing changes.
- Treat phone numbers, auth tokens, push tokens, payment data, wallet balances, call records, CDR payloads, webhook payloads, and provider credentials as sensitive data.
- Never introduce hard-coded secrets or commit local environment files.
- Preserve tenant/user data boundaries in every endpoint and query.
- Keep production deploy paths explicit, auditable, and protected by CI.

Detailed instructions live in `docs/agents/principal-architect-agent.md`.
