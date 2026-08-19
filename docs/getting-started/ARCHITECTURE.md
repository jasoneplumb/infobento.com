# Architecture

## System Overview

InfoBento is a small, solar-powered eInk decorator that lives on a counter, shelf, or windowsill. Configure once on the web; the device fetches frames from a stateless cloud API and shows what matters most — weather, your next event, a countdown, a quote — refreshing once or twice a day on solar power alone.

```
┌──────────────┐    Wi-Fi     ┌─────────────┐
│    Device     │◄────────────►│  Cloud API  │
│  eInk         │              │ (stateless) │
│  ESP32-C3     │              │ (Hono on DO)│
└──────────────┘              └─────────────┘
                                      ▲
                                      │
                                ┌─────┴─────┐
                                │  Web UI    │
                                │  (config)  │
                                └───────────┘
```

Device makes outbound HTTPS calls to the cloud API. No companion phone app; the web editor at `infobento.com` is the only configuration surface. First-time setup uses a captive-portal Wi-Fi pairing flow; recovery via a recessed pinhole reset on the back of the device. See `docs/hardware/CONNECTIVITY.md`.

### Operating Profile

Single mode: counter-standing. Refreshes 1–2× per day on solar power. There is no phone-mounted mode. Native phone apps + BLE bridge are deferred to a possible v2 (see `docs/hardware/CONNECTIVITY.md`'s "v2 path" section).

### Data Flow

1. **User** configures bento boxes via the **Web UI** (browser localStorage, plus server-side storage once the device is paired to an account). The device is pointed at its device id during captive-portal setup, then polls `infobento.com/api/device/{device-id}/frames` each refresh cycle for a server-rendered frame.
2. **Device** stores config in ESP32 NVS.
3. **Device** wakes on RTC alarm, joins saved Wi-Fi, sends config to the **Cloud API** via HTTPS.
4. **Cloud API** renders the framebuffer (pure function: config in, frame buffer out) and returns it.
5. **Device** caches the framebuffer in flash, writes it to the eInk display, and returns to deep sleep.
6. **Offline resilience:** if Wi-Fi is unavailable, the device displays the last cached framebuffer from flash (stale content, not blank).

### Key Design Decisions

- **Stateless API** — pure functions, no server-side state. Config in, frame buffer out.
- **eInk rendering** — eInk panel driven via SSD2677 partial-refresh waveforms.
- **Solar-only power** — refresh budget sized to the solar harvest budget for moderate indoor light; USB-C tops up the battery when needed.
- **Wi-Fi direct + web-only config** — no native phone app for v1. Captive-portal setup, web editor handles configuration.
- **Zero device interaction** — no buttons. Configure once via web, glance forever. The only physical affordance is a recessed pinhole reset for Wi-Fi recovery.
- **Drop survival** — designed for a 4-foot drop onto a hard surface (bumper layer, edge-radiused corners, recessed display, pinhole instead of clickable button).

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
  Internet
     │
     ▼
  Cloudflare (DNS + CDN + DDoS + TLS edge — free tier)
     │
     ▼
  DigitalOcean droplet (co-tenant with tiles- and webmap.dev)
     │
     ▼
  Caddy (TLS termination, reverse proxy, auto-cert via Let's Encrypt)
     │
     ▼
  Hono (:4000) on Node, managed by systemd
     ├── /api/*               → API routes (pure functions)
     ├── /api/firmware/*      → OTA manifest + .bin files (served from disk)
     └── /*                   → Static files from web/dist (SPA fallback)
```

- **Hono** chosen for: lightweight, pure-function friendly, runs unchanged on Node
- **Vite proxy** in dev: `/api` requests forwarded to Hono; all other requests served by Vite with HMR

## Deployment

- **DigitalOcean droplet** ($6/mo tier handles 10K-100K devices comfortably; co-tenant with tiles- and webmap.dev so marginal cost for InfoBento is ~$1-2/mo)
- **Cloudflare proxy** in front (free tier) for DDoS protection, edge cache, TLS termination, anycast DNS
- **OTA firmware** files served directly from `/var/www/firmware/*.bin` on the droplet — no object storage needed at this scale
- **Single port:** Hono serves API + web UI + firmware from one port (default 4000), proxied by Caddy
- **Migration path:** Hono is portable, so moving to Cloudflare Workers, Vercel Edge, or another provider is a few-hour exercise if the droplet ever becomes the bottleneck (it won't at the scales we plan for)
- **Device firmware:** separate repo (future)
