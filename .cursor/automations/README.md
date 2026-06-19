# Cursor automation agents for HelloHello
#
# These definitions mirror the GitHub Actions automation workflows in
# `.github/workflows/automation-agents.yml` and `.github/workflows/fix-ci.yml`.
#
# Import into Cursor Automations:
#   1. Connect GitHub at https://cursor.com/dashboard/integrations
#   2. Open https://cursor.com/automations/new
#   3. Copy each file's trigger, prompt, and tools into a new automation
#   4. Or ask a local agent: "/automate using .cursor/automations/triage-ci-failure.yaml"
#
# Required repo secret for GitHub Actions CLI agents:
#   CURSOR_API_KEY — from https://cursor.com/dashboard

automations:
  - file: triage-ci-failure.yaml
    github_workflow: fix-ci.yml
    description: Investigate failed CI runs and comment on the PR

  - file: autofix-ci-failure.yaml
    github_workflow: fix-ci.yml
    description: Attempt a minimal fix when CI fails on a pull request

  - file: pr-code-review.yaml
    github_workflow: automation-agents.yml
    description: Review PR diffs for bugs and API contract issues

  - file: pr-test-coverage.yaml
    github_workflow: automation-agents.yml
    description: Check that new routes and handlers have Jest coverage
