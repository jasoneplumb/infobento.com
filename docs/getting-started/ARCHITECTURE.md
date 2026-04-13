# Architecture

## System Overview

InfoBento is a portable eInk display device that shows modular boxes of customizable information. The system has four components:

```
┌──────────────┐     BLE      ┌─────────────┐     HTTPS     ┌───────────────┐
│    Device     │◄────────────►│    Phone     │◄─────────────►│   Cloud API   │
│  2.9" eInk    │              │  (BLE bridge) │               │  (stateless)   │
│  240x200 1-bit │              │              │               │               │
│  Solar+battery │              └─────────────┘               └───────────────┘
└──────────────┘                                                     ▲
                                                                     │
                                                               ┌─────┴─────┐
                                                               │  Web UI    │
                                                               │  (config)  │
                                                               └───────────┘
```

### Data Flow

1. **User** configures bento boxes via **Web UI**
2. **Cloud API** stores config (pure function: config in, frame buffer out)
3. **Phone** periodically requests updated frame from API via HTTPS
4. **Phone** pushes frame to **Device** via Bluetooth Low Energy
5. **Device** refreshes eInk display (1-2x per day), then sleeps

### Key Design Decisions

- **Stateless API** — Pure functions, no server-side state. Config in, frame buffer out. Edge-deployable.
- **Phone as bridge** — Device doesn't need WiFi. Phone handles connectivity, caching, and scheduling.
- **1-bit rendering** — eInk is black/white only. Renderer outputs packed bit arrays (240x200 = 6000 bytes).
- **Ultra-low power** — Device only wakes for BLE sync and display refresh. Solar panel maintains battery.

## Package Architecture

```
@infobento/core          Types, constants, layout engine
    ↑           ↑
@infobento/renderer    @infobento/web
    ↑                    (calls API via HTTP)
@infobento/api
```

- **core** has no dependencies on other packages
- **renderer** depends on core (types for layout data)
- **api** depends on core and renderer (orchestrates rendering)
- **web** depends on core (for types), calls api via HTTP (not direct import)

## Deployment

- **Web app:** Private during development. Will be co-hosted with tiles- and webmap.dev.
- **API:** Stateless, edge-deployable (Cloudflare Workers, Vercel Edge, etc.)
- **Device firmware:** Separate repo (future)
