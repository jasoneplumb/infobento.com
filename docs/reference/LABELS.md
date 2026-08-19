# GitHub Labels Reference

Label taxonomy for the infobento.com project. Labels drive automation and workflow tracking.

## Skill-Routing Labels (Required on all issues)

| Label           | Use When                                       |
| --------------- | ---------------------------------------------- |
| `bug`           | Something is broken or regressed               |
| `enhancement`   | New capability or feature request              |
| `refactor`      | Code restructure without functional change     |
| `documentation` | Documentation-only, no code changes            |
| `dependencies`  | Package version bumps                          |
| `chore`         | Maintenance, config updates, cleanup           |
| `hardware`      | Hardware-related specs, protocols, constraints |

## Workflow Labels (Mutually exclusive)

| Label         | Meaning                  |
| ------------- | ------------------------ |
| `backlog`     | Created, awaiting triage |
| `todo`        | Ready to start           |
| `in-progress` | Actively being worked on |
| `done`        | Completed                |

## Planning & Triage Labels

| Label         | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `epic`        | Umbrella issue tracking a body of work across several issues  |
| `important`   | Elevated priority                                             |
| `ongoing`     | Long-running work, not expected to close in one pass          |
| `v2`          | Deferred to a possible v2 (e.g. the color-renderer track)     |
| `pivot`       | Predates the counter-only pivot; kept for history, not active |
| `review-debt` | A merged PR that still owes a retroactive review              |

## Special Labels

| Label              | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `review-requested` | Triggers Claude Code review workflow         |
| `no-review`        | Allows merge without Claude review (CI only) |

GitHub's stock labels (`duplicate`, `invalid`, `wontfix`, `question`,
`good first issue`, `help wanted`) and Dependabot's ecosystem labels
(`github_actions`, `javascript`) also exist but are not part of this
taxonomy.
