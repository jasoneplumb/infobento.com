# API Reference

The InfoBento API is a **Hono** HTTP server. The rendering endpoints below are stateless pure functions; the auth, pairing, and device-config endpoints added by epic #77 are backed by SQLite and are mostly **not** documented here yet (the device frame pulls are; see the endpoint-coverage note at the end). In production, it serves both API routes and the built web UI from a single port (default 4000).

## Design Principles

These describe the five endpoints documented below — three rendering endpoints (validate, render, preview) plus health and box-types — not the API as a whole:

1. **Pure functions** — Same input always produces same output
2. **No server state on the render path** — the config is supplied in the request body, not read from a database. This does **not** hold API-wide: the auth, pairing, and device-config endpoints added by epic #77 are backed by SQLite.
3. **Edge-deployable render path** — the rendering endpoints run unchanged on Node, Cloudflare Workers, Deno, or Bun. The stateful endpoints do not: `better-sqlite3` is a native module, so they are Node-bound as written.
4. **Binary output** — Frame buffers are packed 2-bit-per-pixel arrays (4 pixels per byte, 4 levels per pixel)
5. **Same-port serving** — API + static web UI from one server (like phasebot)

## Running

```bash
# Development (API only, Vite proxies /api)
npm run dev -w @infobento/api     # tsx watch on :4000

# Production (API + static web UI)
npm run build
npm start -w @infobento/api       # Hono on :4000
```

## Endpoints

### GET /api/health

Health check endpoint.

**Response:** `{ status: "ok", version: "<package version>" }` — e.g. `"0.38.3"`.

The version is read at **server startup**, not at build time: `server.ts` resolves
`../package.json` relative to the compiled entrypoint and `readFileSync`s it. A
deployment that ships `dist/` without the adjacent `package.json` therefore fails
at startup rather than falling back to a default.

### GET /api/box-types

List available bento box types.

**Response:** Array of `{ type, label, requiresAuth }` objects. Currently returns a
hardcoded subset — 8 of the 18 box types — with no configuration options; the
drift is tracked in #240.

### POST /api/validate

Validate a bento config without rendering.

**Request:** `BentoConfig` JSON
**Response:** `{ valid: boolean, errors: { path, message }[] }`

### POST /api/render

Render a bento config into a binary frame buffer.

**Request:** `BentoConfig` JSON
**Response:** Binary frame buffer (156,400 bytes for 920x680, packed 2-bit, 4 levels)
**Headers:** `X-Frame-Width`, `X-Frame-Height`

### POST /api/preview

Render a bento config into a PNG preview image. Supports an optional `scale` query parameter for upscaling (default: 3). `scale` must be an integer from 1 to 8 — anything else is a 400.

**Request:** `BentoConfig` JSON
**Query:** `?scale=N` (integer 1–8, optional, default 3); `?dual=1` (optional)
**Response:** PNG image (`image/png`)

With `?dual=1` the response is JSON instead of a PNG: `{ landscape, portrait, landscapeIds, portraitIds }` — both orientations as base64-encoded PNGs plus the box ids rendered in each.

---

## Device frame pulls (firmware-facing)

Unlike the endpoints above, these read the config stored for a device (SQLite), so the
design principles above do not apply. The device id in the path is the bearer secret.
Both endpoints are rate-limited to 10 requests per minute per device id (`429`, `Retry-After: 60`).

### GET /api/device/:id/frames

Render the device's stored config in **both** orientations and return them concatenated
(landscape, then portrait) as one `application/octet-stream` body. The portrait frame is
rotated into the panel's landscape raster, so both halves have the same geometry.
`GET /api/device/:id/frame?orientation=landscape|portrait` returns one orientation and
takes the same request headers and status codes.

**Request headers** (all optional):

| Header              | Meaning                                                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Panel`           | The device's native landscape panel size, `WIDTHxHEIGHT` (e.g. `800x480`). When present, frames are rendered at this size whatever `width`/`height` the stored config carries. When absent (older firmware), the config's `width`/`height` decide, falling back to 920×680. |
| `If-None-Match`     | An `ETag` from an earlier response. Takes precedence over `If-Modified-Since`.                                                                                                                                                                                              |
| `If-Modified-Since` | A `Last-Modified` from an earlier response. Used only when `If-None-Match` is absent.                                                                                                                                                                                       |

`X-Panel` must be one of the sizes in `DEVICE_PROFILES` (`packages/core/src/constants.ts`):
currently `800x480` (Seeed reTerminal E1001) and `920x680` (GDEH0576T81). It is
case-insensitive, must give the long side first, and must not use leading zeros.

**Response headers:**

| Header                                              | Sent on  | Meaning                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Last-Modified`                                     | 200, 304 | The later of the config's last edit and the current data-refresh boundary.                                                                                                                                                                                                  |
| `ETag`                                              | 200, 304 | `"<unix-seconds>-<size>-<variant>"`: `<size>` is the declared `WxH`, or `config` when none is declared; `<variant>` is `both` (`/frames`), `landscape` or `portrait` (`/frame`). Changes whenever the frame would, and never matches another size, orientation or endpoint. |
| `Vary`                                              | 200, 304 | `X-Panel`: the declared size is part of what a cached frame is valid for.                                                                                                                                                                                                   |
| `X-Refresh-Interval`                                | 200, 304 | Seconds until the next pull. Omitted when scheduled refresh is disabled.                                                                                                                                                                                                    |
| `X-Device-Forget`                                   | 200, 304 | `1` once, when the owner asked the device to forget its Wi-Fi.                                                                                                                                                                                                              |
| `X-Frame-{Landscape,Portrait}-{Width,Height,Bytes}` | 200      | Per-orientation geometry and byte length, so the device can split the body (`/frames`).                                                                                                                                                                                     |
| `X-Frame-Width`, `X-Frame-Height`                   | 200      | Geometry of the single frame (`/frame`).                                                                                                                                                                                                                                    |

**Status codes:**

| Status | Meaning                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Frames in the body.                                                                                                                                                                               |
| `304`  | The validator still matches. A validator issued for one panel size never matches a pull that declares another, so the device re-renders after a panel change.                                     |
| `404`  | Unknown device id, or the device has no config yet.                                                                                                                                               |
| `422`  | `X-Panel` is not a supported size. Body: `{ "error": "unsupported_panel", "panel": "<declared>", "supported": ["800x480", "920x680"] }`. The server also logs a warning naming the declared size. |
| `429`  | Rate limited.                                                                                                                                                                                     |
| `500`  | The stored config could not be parsed or rendered.                                                                                                                                                |

---

## Endpoint coverage

⚠️ **This reference documents 7 of the API's 28 routes.** The five stateless endpoints under
Endpoints (three rendering endpoints plus health and box-types) and the two device frame
pulls. Undocumented, all added after this file was written:

| Group                    | Routes                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Auth — passkey           | `POST /api/auth/passkey/{register,login}/{options,verify}`                                             |
| Auth — OAuth             | `GET /api/auth/oauth/:provider/{start,callback}`                                                       |
| Auth — session           | `GET /api/auth/session`, `POST /api/auth/signout`                                                      |
| Pairing                  | `POST /api/pair`                                                                                       |
| Account                  | `GET /api/me/devices`, `GET /api/me/device/:id/config` (session-gated), `DELETE /api/device/:id/owner` |
| Device (firmware-facing) | `GET /api/device/:id/config`, `PUT /api/device/:id/config`, `POST /api/device/:id/forget`              |
| Rendering                | `POST /api/render-dual`                                                                                |
| Data proxies             | `GET /api/{quote,horoscope,stocks,onthisday,geolocate}`                                                |

Authoritative source is `packages/api/src/server.ts`. Documenting these matters most for
self-hosters, since the auth env vars in the README are useless without the routes they
configure. Tracked as follow-up work.
