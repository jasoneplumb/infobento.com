# Documentation

> _See what matters. Skip the spiral._

Most documentation lives **inline with the code** using intent headers (see [INTENT_TEMPLATES.md](reference/INTENT_TEMPLATES.md)). This directory contains the reference docs you'll need alongside the source.

---

## Where to Start

### New Contributors

1. [Setup](getting-started/SETUP.md) — clone, install, verify
2. [Architecture](getting-started/ARCHITECTURE.md) — system design and data flow
3. [Development](getting-started/DEVELOPMENT.md) — workflows and conventions
4. [Contributing](../CONTRIBUTING.md) — PR guidelines

### Documentation Writers

1. [Intent Templates](reference/INTENT_TEMPLATES.md) — inline documentation standard

---

## Documentation Map

```
docs/
├── getting-started/
│   ├── SETUP.md              5-minute setup guide
│   ├── ARCHITECTURE.md       System design, data flow, deployment
│   └── DEVELOPMENT.md        Workflows, conventions, debugging
│
├── reference/
│   ├── INTENT_TEMPLATES.md   Inline documentation standard
│   ├── TESTING.md            Test strategy and guidelines
│   ├── LABELS.md             GitHub label taxonomy
│   └── API.md                Pure function API reference
│
├── hardware/
│   ├── DISPLAY.md            eInk display specs, form factor, refresh modes
│   ├── POWER.md              Dual-mode power budget (solar + MagSafe)
│   └── BLE.md                BLE protocol for both operating modes
│
└── rfcs/                     Architecture decision records
```

**Root Files:**

- `CLAUDE.md` — AI assistant architecture guide
- `CONTRIBUTING.md` — Contribution workflow
- `AGENT_POLICY.md` — Agent constraints and policies
- `AGENTS.md` — Concise repo guidelines for AI agents
