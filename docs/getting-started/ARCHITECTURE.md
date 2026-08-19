# Architecture

## System Overview

InfoBento is a small, solar-powered eInk decorator that lives on a counter, shelf, or windowsill. Configure once on the web; the device fetches server-rendered frames from the cloud API and shows what matters most — weather, your next event, a countdown, a quote — refreshing once or twice a day on solar power alone.

```
┌──────────────┐    Wi-Fi     ┌─────────────┐
│    Device     │◄────────────►│  Cloud API  │
│  eInk         │              │ (Hono on DO)│
│  ESP32-C3     │              │ + SQLite    │
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
2. **Device** stores its Wi-Fi credentials, device id, and server URL in ESP32 NVS — not the bento config, which lives server-side.
3. **Device** wakes on RTC alarm, joins saved Wi-Fi, and issues `GET /api/device/{device-id}/frames` over HTTPS, sending `If-Modified-Since` so an unchanged frame costs a 304.
4. **Cloud API** looks up the device's stored config, hydrates live box data, renders both orientations, and returns them.
5. **Device** writes the framebuffer to the eInk display and returns to deep sleep. The framebuffer itself does not survive sleep — only `Last-Modified` and a boot counter persist, in RTC slow memory (`RTC_DATA_ATTR`).
6. **Offline resilience:** if Wi-Fi is unavailable, the panel simply keeps showing the last frame it was given (stale content, not blank). This is a physical property of eInk, not a cache — no flash copy of the framebuffer is needed. (The `integrated`/`orientation` sketches do keep a LittleFS copy of both orientations, but that exists to serve the local orientation flip with the radio off, not for offline resilience.)

### Key Design Decisions

- **Pure-function rendering** — `POST /api/render` is config in, frame buffer out, with no state involved. The device-facing path is not stateless: since epic #77 the server stores accounts, device pairings, and per-device config in SQLite, and renders from that.
- **eInk rendering** — eInk panel driven via SSD2677 partial-refresh waveforms.
- **Solar-only power** — refresh budget sized to the solar harvest budget for moderate indoor light; USB-C tops up the battery when needed.
- **Wi-Fi direct + web-only config** — no native phone app for v1. Captive-portal setup, web editor handles configuration.
- **Zero device interaction** — no buttons. Configure once via web, glance forever. The only physical affordance is a recessed pinhole reset for Wi-Fi recovery.
- **Drop survival** — designed for a 4-foot drop onto a hard surface (bumper layer, edge-radiused corners, recessed display, pinhole instead of clickable button).

## Package Architecture

| Package               | Depends on           | Role                             |
| --------------------- | -------------------- | -------------------------------- |
| `@infobento/core`     | —                    | Types, constants, layout engine  |
| `@infobento/data`     | core                 | Box-data providers + cache       |
| `@infobento/renderer` | core                 | eInk framebuffer generation      |
| `@infobento/api`      | core, data, renderer | Hydrates box data, then renders  |
| `@infobento/web`      | core, data           | Config UI; reaches api over HTTP |

Dependencies flow strictly downward in that table — nothing depends on a package
listed below it, and there are no cycles.

- **data** is browser- and edge-safe: pure `fetch`, no DOM or `window`
- **web** reaches `api` over HTTP and never imports it directly
- **web** does **not** depend on `renderer`: the editor previews by calling
  `POST /api/preview`, so nothing is rasterized in the browser

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
  DigitalOcean droplet (co-tenant with tiles- and webmap.dev)
     │
     ▼
  nginx (TLS termination, reverse proxy) — host-managed, not provisioned from this repo
     │
     ▼
  Hono on Node, bound to 127.0.0.1:4000, managed by systemd
     ├── /api/*  → API routes
     └── /*      → Static files from web/dist (SPA fallback)
```

The apex `infobento.com` 301-redirects to `www.infobento.com`, which is the
canonical host. See [DEPLOY.md](../DEPLOY.md) for the host layout, the
version-controlled systemd unit, and the required secrets.

- **Hono** chosen for: lightweight, pure-function friendly, runs unchanged on Node
- **Vite proxy** in dev: `/api` requests forwarded to Hono; all other requests served by Vite with HMR

## Deployment

- **DigitalOcean droplet** ($6/mo tier handles 10K-100K devices comfortably; co-tenant with tiles- and webmap.dev so marginal cost for InfoBento is ~$1-2/mo)
- **nginx** on the droplet terminates TLS and reverse-proxies to Hono on `127.0.0.1:4000`. It is configured on the host, not from this repo — the only deploy-managed server config here is [`deploy/infobento.service`](../../deploy/infobento.service).
- **Single port:** Hono serves API + web UI from one port (default 4000), behind nginx
- **Migration path:** the pure render path (`POST /api/render`, `/api/preview`, `/api/validate`) is portable to Workers/Deno/Bun unchanged. The auth, pairing, and device-config paths are **not** — `better-sqlite3` is a native module, so those are Node-bound until the store is swapped.
- **Device firmware:** in this repo under [`firmware/`](../../firmware/README.md) — Arduino sketches for the ESP32-S3 dev board (reTerminal E1001), targeting ESP32-C3 for production.

**Not yet built:** there is no OTA firmware distribution — no `/api/firmware/*`
route exists, and nothing serves `.bin` files. Firmware is flashed over USB
(see [`firmware/README.md`](../../firmware/README.md)). There is also no
Cloudflare proxy in front of the origin today; the droplet's nginx is reached
directly.
