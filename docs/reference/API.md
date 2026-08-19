# API Reference

The InfoBento API is a **Hono** HTTP server. The rendering endpoints below are stateless pure functions; the auth, pairing, and device-config endpoints added by epic #77 are backed by SQLite and are **not** documented here yet (see the endpoint-coverage note at the end). In production, it serves both API routes and the built web UI from a single port (default 4000).

## Design Principles

1. **Pure functions** — Same input always produces same output
2. **No server state** — Config comes from the client, not a database
3. **Edge-deployable** — Hono runs on Node, Cloudflare Workers, Deno, Bun
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

**Response:** `{ status: "ok", version: "0.1.0" }`

### GET /api/box-types

List available bento box types and their configuration options.

**Response:** Array of `{ type, label, requiresAuth }` objects

### POST /api/validate

Validate a bento config without rendering.

**Request:** `BentoConfig` JSON
**Response:** `{ valid: boolean, errors: string[] }`

### POST /api/render

Render a bento config into a binary frame buffer.

**Request:** `BentoConfig` JSON
**Response:** Binary frame buffer (156,400 bytes for 920x680, packed 2-bit, 4 levels)
**Headers:** `X-Frame-Width`, `X-Frame-Height`

### POST /api/preview

Render a bento config into a PNG preview image. Supports optional `scale` query parameter for upscaling (default: 1).

**Request:** `BentoConfig` JSON
**Query:** `?scale=N` (integer, optional)
**Response:** PNG image (`image/png`)

---

## Endpoint coverage

⚠️ **This reference documents 5 of the API's 28 routes.** The five above are the stateless
rendering endpoints. Undocumented, all added after this file was written:

| Group                    | Routes                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Auth — passkey           | `POST /api/auth/passkey/{register,login}/{options,verify}`                                               |
| Auth — OAuth             | `GET /api/auth/oauth/:provider/{start,callback}`                                                         |
| Auth — session           | `GET /api/auth/session`, `POST /api/auth/signout`                                                        |
| Pairing                  | `POST /api/pair`                                                                                         |
| Account                  | `GET /api/me/devices`, `DELETE /api/device/:id/owner`                                                    |
| Device (firmware-facing) | `GET /api/device/:id/{config,frame,frames}`, `PUT /api/device/:id/config`, `POST /api/device/:id/forget` |
| Rendering                | `POST /api/render-dual`                                                                                  |
| Data proxies             | `GET /api/{quote,joke,horoscope,stocks,onthisday,geolocate}`                                             |

Authoritative source is `packages/api/src/server.ts`. Documenting these matters most for
self-hosters, since the auth env vars in the README are useless without the routes they
configure. Tracked as follow-up work.
