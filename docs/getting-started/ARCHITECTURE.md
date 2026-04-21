# Architecture

## System Overview

InfoBento is a MagSafe-mounted eInk companion display that lives on the back of your iPhone. It's a clamshell: one side is a 2.9" black-and-white eInk screen, the other is a solar panel. A 320-degree hinge lets you stand it on a counter with the solar panel aimed at a window, or fold it flat against your phone.

```
┌──────────────┐     BLE      ┌─────────────┐     HTTPS     ┌───────────────┐
│    Device     │◄────────────►│    Phone     │◄─────────────►│   Cloud API   │
│  2.9" eInk    │              │  (BLE bridge) │               │  (stateless)   │
│  ESP32-C3     │              │              │               │               │
│  Solar+MagSafe│              └─────────────┘               └───────────────┘
└──────────────┘                                                     ▲
                                                                     │
                                                               ┌─────┴─────┐
                                                               │  Web UI    │
                                                               │  (config)  │
                                                               └───────────┘
```

### Physical Modes

| Mode             | Form Factor                     | Refresh Rate      | Power Source           |
| ---------------- | ------------------------------- | ----------------- | ---------------------- |
| Phone-mounted    | Flat on iPhone back via MagSafe | Every few minutes | MagSafe reverse-charge |
| Counter-standing | Hinged open, solar at window    | 1-2x per day      | Solar panel            |
| Collapsed        | Folded shut, on phone or pocket | None (sleeping)   | MagSafe reverse-charge |

### Data Flow

1. **User** configures bento boxes via **Web UI**
2. **Cloud API** is a pure function: config in, frame buffer out
3. **Phone** requests updated frame from API via HTTPS (frequency depends on mode)
4. **Phone** pushes frame to **Device** via Bluetooth Low Energy
5. **Device** refreshes eInk display, then sleeps or stays in low-power connected state

### Key Design Decisions

- **Stateless API** — Pure functions, no server-side state. Config in, frame buffer out. Edge-deployable.
- **Phone as bridge** — Device doesn't need WiFi. Phone handles connectivity, caching, and scheduling.
- **1-bit rendering** — eInk is black/white only. Renderer outputs packed bit arrays.
- **Dual power modes** — Solar for standalone counter use; MagSafe reverse-charge for phone-mounted use.
- **Zero device interaction** — No buttons, no app to open. Configure once via web, glance forever.

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

## Server Architecture

Same-port pattern (like phasebot): Hono serves both API and web UI.

```
Development:
  Vite (:5173)  ──proxy /api──►  Hono (:4000)
   └── HMR for React               └── API routes only

Production:
  Hono (:4000)
   ├── /api/*        → API routes (pure functions)
   └── /*            → Static files from web/dist (SPA fallback)
```

- **Hono** chosen for: edge deployability (Node, Cloudflare Workers, Deno, Bun), lightweight, pure-function friendly
- **Vite proxy** in dev: `/api` requests forwarded to Hono; all other requests served by Vite with HMR

## Deployment

- **Single port:** Hono serves API + web UI from one port (default 4000). Private during development. Will be co-hosted with tiles- and webmap.dev.
- **Edge option:** API can also deploy standalone to Cloudflare Workers, Vercel Edge, etc.
- **Device firmware:** Separate repo (future)
