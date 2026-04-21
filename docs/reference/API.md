# API Reference

The InfoBento API is a **Hono** HTTP server with stateless pure-function endpoints. In production, it serves both API routes and the built web UI from a single port (default 4000).

## Design Principles

1. **Pure functions** — Same input always produces same output
2. **No server state** — Config comes from the client, not a database
3. **Edge-deployable** — Hono runs on Node, Cloudflare Workers, Deno, Bun
4. **Binary output** — Frame buffers are packed 1-bit-per-pixel arrays
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
**Response:** Binary frame buffer (6000 bytes for 240x200 — will change with final display resolution)
**Headers:** `X-Frame-Width`, `X-Frame-Height`

### POST /api/preview

Render a bento config into a PNG preview image. Supports optional `scale` query parameter for upscaling (default: 1).

**Request:** `BentoConfig` JSON
**Query:** `?scale=N` (integer, optional)
**Response:** PNG image (`image/png`)
