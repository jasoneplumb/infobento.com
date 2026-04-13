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

## Special Labels

| Label              | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `review-requested` | Triggers Claude Code review workflow         |
| `no-review`        | Allows merge without Claude review (CI only) |
