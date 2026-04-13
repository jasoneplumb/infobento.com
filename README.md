# InfoBento

A credit-card-sized portable eInk display that shows modular boxes of customizable information.

## Overview

InfoBento is an ultra-low-power display device that updates once or twice daily through your phone's Bluetooth connection. Users configure their display through a web interface, choosing from different "bento boxes" of information — weather, calendar, tasks, quotes, and more.

### Hardware

- **Display:** 2.9" eInk (240x200 pixels, 1-bit black/white)
- **Power:** Solar panel + rechargeable battery
- **Connectivity:** Bluetooth Low Energy (via phone bridge)
- **Form factor:** Credit card sized, wallet-portable

### Architecture

```
┌──────────┐     BLE      ┌───────┐     HTTPS     ┌───────────┐
│  Device   │◄────────────►│ Phone │◄─────────────►│ Cloud API │
│  (eInk)   │              │ (app) │               │ (stateless)│
└──────────┘              └───────┘               └───────────┘
                                                        ▲
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
