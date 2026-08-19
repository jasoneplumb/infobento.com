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
├── DEPLOY.md                Production deploy: secrets, systemd unit, OAuth setup
├── LICENSE                  CC-BY-4.0 — license for everything in docs/
│
├── product-brief.md         Product positioning, BOM, competitive framing
├── design-brief.md          Design principles, requirements, visual system
│
├── getting-started/
│   ├── SETUP.md              5-minute setup guide
│   ├── ARCHITECTURE.md       System design, data flow, deployment
│   └── DEVELOPMENT.md        Workflows, conventions, debugging
│
├── reference/
│   ├── INTENT_TEMPLATES.md   Inline documentation standard
│   ├── TESTING.md            Test strategy and guidelines
│   ├── LABELS.md             GitHub label taxonomy
│   ├── API.md                Pure function API reference
│   └── infobento-config.json Example BentoConfig payload
│
├── hardware/
│   ├── DISPLAY.md            eInk display specs, form factor, refresh strategy
│   ├── POWER.md              Solar power budget for the counter device
│   ├── CONNECTIVITY.md       Wi-Fi direct + captive portal setup; v2 BLE path
│   ├── FIRMWARE_BRINGUP.md   Dev-first firmware bring-up plan (reTerminal → production)
│   ├── PHASE4_BENCH_CHECKLIST.md  Bench validation checklist for the integrated sketch
│   └── walkthrough-E1001-hw-setup.md  Step-by-step reTerminal E1001 bench setup
│
└── rfcs/                     Architecture decision records
```

**Root Files:**

- `CLAUDE.md` — AI assistant architecture guide
- `CONTRIBUTING.md` — Contribution workflow
- `AGENT_POLICY.md` — Agent constraints and policies
- `AGENTS.md` — Concise repo guidelines for AI agents
- `LICENSING.md` — Which license covers which part of the repo
- `NOTICE` — Apache-2.0 attribution notice
- `SECURITY.md` — Vulnerability reporting
- `CODE_OF_CONDUCT.md` — Community standards
