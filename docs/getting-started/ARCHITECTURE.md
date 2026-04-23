# Architecture

## System Overview

InfoBento is a small, solar-powered color eInk decorator that lives on a counter, shelf, or windowsill. Configure once on the web; the device fetches frames from a stateless cloud API and shows what matters most — weather, your next event, a countdown, a quote — refreshing once or twice a day on solar power alone.

```
┌──────────────┐    Wi-Fi     ┌─────────────┐
│    Device     │◄────────────►│  Cloud API  │
│  color eInk   │              │ (stateless) │
│  ESP32 + solar│              └─────────────┘
└──────────────┘                      ▲
                                      │
                                ┌─────┴─────┐
                                │  Web UI    │
                                │  (config)  │
                                └───────────┘
```

(Connectivity model — Wi-Fi direct vs phone-bridged BLE — is pending decision in #35. Diagram shows the leading Wi-Fi-direct path.)

### Operating Profile

Single mode: counter-standing. Refreshes 1–2× per day on solar power. There is no longer a phone-mounted minute-level mode (that died with the pivot away from the MagSafe clamshell — see RFC #25).

### Data Flow

1. **User** configures bento boxes via the **Web UI** (browser localStorage)
2. **Cloud API** is a pure function: config in, frame buffer out
3. **Device** wakes on RTC alarm and fetches the current frame from the API (Wi-Fi direct, or via phone bridge)
4. **Device** writes the frame to the eInk display and returns to deep sleep

### Key Design Decisions

- **Stateless API** — pure functions, no server-side state. Config in, frame buffer out. Edge-deployable.
- **Color rendering** — color eInk panel (Spectra 6 / ACeP family) with a 7-color palette. Rendering is panel-aware via `Color` enum exported from `@infobento/core` (Phase 3, in progress).
- **Solar-only power** — no MagSafe, no charging cable. Refresh budget sized to the solar harvest budget for moderate indoor light.
- **Zero device interaction** — no buttons. Configure once via web, glance forever. Setup UX (Wi-Fi pairing) is the one place this is hard; see `docs/hardware/BLE.md`.
- **Drop survival** — designed for a 4-foot drop onto a hard surface (bumper layer, edge-radiused corners, recessed display).

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
   └── HMR                         └── API routes only

Production:
  Hono (:4000)
   ├── /api/*        → API routes (pure functions)
   └── /*            → Static files from web/dist (SPA fallback)
```

- **Hono** chosen for: edge deployability (Node, Cloudflare Workers, Deno, Bun), lightweight, pure-function friendly
- **Vite proxy** in dev: `/api` requests forwarded to Hono; all other requests served by Vite with HMR

## Deployment

- **Single port:** Hono serves API + web UI from one port (default 4000). Co-hosted with tiles- and webmap.dev.
- **Edge option:** API can also deploy standalone to Cloudflare Workers, Vercel Edge, etc.
- **Device firmware:** separate repo (future)

## Mid-pivot status

The codebase is mid-pivot from a previous dual-display MagSafe clamshell concept (D outer / P inner) to the counter-only color decorator described above. Some abstractions (`DisplayId`, the dual-display web editor 2×2 layout, the 1-bit renderer) are still present in `main` and will be migrated phase-by-phase. See RFC #25 and the `pivot/counter-color` milestone for in-flight work.
