# API Reference

The InfoBento API is a **Hono** HTTP server. The rendering endpoints below are stateless pure functions; the auth, pairing, and device-config endpoints added by epic #77 are backed by SQLite and are **not** documented here yet (see the endpoint-coverage note at the end). In production, it serves both API routes and the built web UI from a single port (default 4000).

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

## Endpoint coverage

⚠️ **This reference documents 5 of the API's 28 routes.** The five above are the stateless
endpoints — three rendering endpoints plus health and box-types. Undocumented, all added
after this file was written:

| Group                    | Routes                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Auth — passkey           | `POST /api/auth/passkey/{register,login}/{options,verify}`                                               |
| Auth — OAuth             | `GET /api/auth/oauth/:provider/{start,callback}`                                                         |
| Auth — session           | `GET /api/auth/session`, `POST /api/auth/signout`                                                        |
| Pairing                  | `POST /api/pair`                                                                                         |
| Account                  | `GET /api/me/devices`, `GET /api/me/device/:id/config` (session-gated), `DELETE /api/device/:id/owner`   |
| Device (firmware-facing) | `GET /api/device/:id/{config,frame,frames}`, `PUT /api/device/:id/config`, `POST /api/device/:id/forget` |
| Rendering                | `POST /api/render-dual`                                                                                  |
| Data proxies             | `GET /api/{quote,horoscope,stocks,onthisday,geolocate}`                                                  |

Authoritative source is `packages/api/src/server.ts`. Documenting these matters most for
self-hosters, since the auth env vars in the README are useless without the routes they
configure. Tracked as follow-up work.
