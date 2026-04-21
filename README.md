# InfoBento

_See less. Know enough._

A MagSafe-mounted eInk companion display that lives on the back of your iPhone. Clamshell form factor with a 320-degree hinge — open it to stand on a counter with the solar panel aimed at a window, or leave it flat on your phone as a glanceable second screen.

## Overview

InfoBento puts the information you'd unlock your phone to check — weather, next meeting, countdown to vacation — on the _outside_ of your phone. Flip it over, glance, move on. No unlock, no app, no rabbit hole.

At home, stand it on the kitchen counter. The hinged solar panel aims at the window and keeps it charged indefinitely. Configure your boxes once from a web page, and it just works — for months, silently, on sunlight. $35 target via Kickstarter.

### Hardware

- **Display:** 2.9" eInk, 1-bit black/white (resolution TBD — codebase uses 240x200, standard panels are 296x128)
- **MCU:** ESP32-C3 (RISC-V, BLE 5.0, low power)
- **Power:** Rechargeable battery + solar drip charger; passive MagSafe reverse-charge from iPhone when collapsed
- **Connectivity:** Bluetooth Low Energy (via phone bridge)
- **Form factor:** MagSafe clamshell — fits on iPhone 15 Pro back (146.6 x 70.6mm)
- **Hinge:** 320-degree, enables three modes: phone-mounted, counter-standing, collapsed/charging

### Physical Modes

```
Phone-mounted          Counter-standing         Collapsed
┌─────────┐           ┌─────────┐              ┌─────────┐
│  eInk   │           │  eInk   │              │  Solar  │
│ display  │           │ display  │              │  panel  │
├─────────┤           ├────┐    │              ├─────────┤
│ MagSafe │           │    │ Solar              │  eInk   │
│ iPhone  │           │    │ panel              │ (hidden) │
└─────────┘           └────┘    │              └─────────┘
                      ▲ window                  ▲ on iPhone
Peek without          Solar charges,            Charges via
unlocking             display faces room        MagSafe
```

### Architecture

```
┌──────────────┐     BLE      ┌───────┐     HTTPS     ┌───────────┐
│    Device     │◄────────────►│ Phone │◄─────────────►│ Cloud API │
│  eInk + solar │              │ (app) │               │ (stateless)│
│  MagSafe mount│              └───────┘               └───────────┘
└──────────────┘                                            ▲
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
