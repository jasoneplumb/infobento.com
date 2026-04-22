# InfoBento

A MagSafe-mounted dual-eInk companion display that lives on the back of your iPhone. Two 2.9" displays back-to-back in a clamshell: one for your phone, one for your counter. 180-degree hinge, solar charging, zero interaction.

## Overview

InfoBento puts the information you'd unlock your phone to check — weather, next meeting, countdown to vacation — on the _outside_ of your phone. Flip it over, glance, move on. No unlock, no app, no rabbit hole.

At home, open it and stand it on the kitchen counter. A different display faces you with a relaxed layout — quote, full agenda, countdown — while the solar panel charges from window light. Fold it closed and snap it back on your phone. No re-render, no delay — each display holds its own frame. $30 target via Kickstarter.

### Hardware

- **Displays:** Two 2.9" eInk panels (128x296, 1-bit), back-to-back on one PCB
  - **D (outer):** Phone-mounted display — real-time data, partial refresh every 2-5 min
  - **P (inner):** Counter/peek display — ambient content, full refresh 1-2x/day
- **MCU:** ESP32-C3 MINI-1 (RISC-V, BLE 5.0, 8µA deep sleep)
- **Power:** 100mAh LiPo + AEM10941 solar harvester + MagSafe Qi reverse-charge
- **Connectivity:** Bluetooth Low Energy (via phone bridge)
- **Form factor:** MagSafe clamshell — fits on iPhone 15 Pro back (146.6 x 70.6mm)
- **Hinge:** 180-degree friction hinge, book-style along short edge
- **Thickness:** ~7.2mm folded

### Four Surfaces (D, P, S, M)

```
Display half          Solar half
┌──────────┐         ┌──────────┐
│ D (outer)│         │ M (outer)│  MagSafe magnets + Qi coil
│ eInk #1  │         │          │
├──────────┤         ├──────────┤
│ P (inner)│         │ S (inner)│  Solar panel
│ eInk #2  │         │          │
└──────────┘         └──────────┘
      └── 180° hinge ──┘
```

### Physical Modes

```
CLOSED (0°)         PEEK (90°)          COUNTER (~100°)
D faces out         P faces user        P faces user

  D│P S│M│phone│    │P  D│              P│
  └────┘ └─────┘    └────┘───           ─┘\___S___
                    hinge  S M          hinge  M(base)
Phone-mounted       Quick glance        Solar charging
D = real-time       P = ambient         P = ambient
```

### Architecture

```
┌────────────────┐     BLE      ┌───────┐     HTTPS     ┌───────────┐
│     Device      │◄────────────►│ Phone │◄─────────────►│ Cloud API │
│ D + P displays  │              │ (app) │               │ (stateless)│
│ Solar + MagSafe │              └───────┘               └───────────┘
└────────────────┘                                            ▲
                                                              │
                                                        ┌─────┴─────┐
                                                        │  Web UI    │
                                                        │ (config)   │
                                                        └───────────┘
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/jasoneplumber/infobento.com.git
cd infobento.com
npm install

# Build and verify
npm run build
npm test
npm run lint
```

## Monorepo Structure

| Package              | Name                  | Purpose                                     |
| -------------------- | --------------------- | ------------------------------------------- |
| `packages/core/`     | `@infobento/core`     | Types, bento box definitions, layout engine |
| `packages/renderer/` | `@infobento/renderer` | 1-bit eInk frame buffer generation          |
| `packages/api/`      | `@infobento/api`      | Stateless pure-function cloud API           |
| `packages/web/`      | `@infobento/web`      | Web configuration interface                 |

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.
