# API Reference

The InfoBento API is a stateless pure-function service. Every endpoint takes input and returns output with no server-side state.

## Design Principles

1. **Pure functions** — Same input always produces same output
2. **No server state** — Config comes from the client, not a database
3. **Edge-deployable** — Runs on Cloudflare Workers, Vercel Edge, etc.
4. **Binary output** — Frame buffers are packed 1-bit-per-pixel arrays

## Planned Endpoints

### POST /api/render

Render a bento config into a binary frame buffer.

**Request:** `BentoConfig` JSON
**Response:** Binary frame buffer (6000 bytes for 240x200)

### POST /api/preview

Render a bento config into a PNG preview image.

**Request:** `BentoConfig` JSON
**Response:** PNG image

### POST /api/validate

Validate a bento config without rendering.

**Request:** `BentoConfig` JSON
**Response:** `{ valid: boolean, errors: string[] }`

### GET /api/box-types

List available bento box types and their configuration options.

**Response:** Array of box type definitions

### GET /api/health

Health check endpoint.

**Response:** `{ status: "ok", version: "0.1.0" }`
