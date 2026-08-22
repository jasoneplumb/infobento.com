# infobento.com — Project Instructions

## Quick Reference

```bash
npm install          # Install all workspace dependencies
npm run build        # Build all packages (tsc -b)
npm run typecheck    # Type-check all packages
npm test             # Run all tests (vitest)
npm run lint         # Lint all packages (eslint)
npm run format:check # Check formatting (prettier)
```

## Quality Gate (run before committing)

```bash
npm run build && npm test && npm run lint && npm run format:check
```

## Monorepo Structure

```
infobento.com/
├── packages/core/      @infobento/core: types, bento box definitions, layout engine
├── packages/data/      @infobento/data: pure box-data providers (weather, quote, …) + cache
├── packages/renderer/  @infobento/renderer: eInk frame buffer generation
├── packages/api/       @infobento/api: Hono server — render API, auth/pairing (SQLite), static files
└── packages/web/       @infobento/web: Vite + vanilla-TS configuration interface (private)
```

## Dev Server Architecture

Same-port pattern (like phasebot):

- **Dev:** Vite dev server (port 5173) with HMR. Proxies `/api` to Hono (port 4000).
- **Prod:** Hono serves both API routes and built web static files from a single port.

```bash
# Development (two terminals)
npm run dev -w @infobento/api    # Hono API on :4000 (tsx watch)
npm run dev -w @infobento/web    # Vite HMR on :5173, proxies /api to :4000

# Production
npm run build                    # Build all packages + Vite
npm start -w @infobento/api      # Hono serves everything on :4000
```

## Module Boundaries

```
core (types, layout)  <──  renderer (eInk framebuffer)  <──  api (render + auth/pairing)
  ^                                                            ^
  ├──  data (box-data providers + cache)  ─────────────────────┘
  └──  web (config UI)  ───────────────  data
```

- `core` imports nothing from other packages
- `data` imports only from `core` (pure `fetch`, no DOM/`window`, browser- and edge-safe)
- `renderer` imports only from `core`
- `api` imports from `core`, `data`, and `renderer`
- `web` imports from `core` and `data`, and calls `api` via HTTP (not direct
  import). It does **not** depend on `renderer` — the editor previews via
  `POST /api/preview`, so nothing is rasterized in the browser.

## Critical: .js Extensions Required

**Relative** imports within `core`, `data`, `renderer`, and `api` MUST include `.js`
extensions. The project uses `module: "Node16"` with no bundler — extensionless
relative imports fail at runtime.

```typescript
// Correct — relative import, .js extension
import { splitLeftFraction } from './constants.js';

// Wrong — will fail at runtime
import { splitLeftFraction } from './constants';
```

**Cross-package** imports use the bare package specifier. Every workspace package
declares `"."` in its `exports` map and nothing else, with a single deliberate
exception (below), so an undeclared subpath import throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

```typescript
// Correct — bare specifier
import { render } from '@infobento/renderer';

// Wrong — subpath is not exported
import { render } from '@infobento/renderer/index.js';
```

**The one declared subpath is `@infobento/data/safe-fetch`.** The SSRF guard
imports `node:dns/promises`, so it cannot live in the `@infobento/data` barrel —
`web` consumes that barrel, and a Node-only module in the browser graph breaks
the Vite build (#231). Keep it out of the barrel and import it by subpath:

```typescript
// Correct — Node-only guard, imported by its own subpath
import { safeFetch } from '@infobento/data/safe-fetch';
```

Anything else added to `data` must stay browser- and edge-safe, or get the same
treatment.

**Exception:** The `web` package uses Vite's bundler (`moduleResolution: "bundler"`) and does NOT require `.js` extensions.

## TypeScript

- **Target: ES2020** — do NOT use ES2022+ features (e.g., `new Error('msg', { cause })`)
- Strict mode enabled with `noUncheckedIndexedAccess`
- `verbatimModuleSyntax` — use `import type` for type-only imports

## Testing

- Tests live alongside source: `packages/*/src/**/*.test.ts`
- Framework: Vitest 3.x
- Run from project root: `npm test`

## Hardware Context

InfoBento is a bento-box-sized countertop eInk display:

- **Display:** Good Display GDEH0576T81, 5.76" eInk, 920x680 pixels, 198 DPI (SSD2677 driver) — production target
- **Dev hardware:** prototyping on the Seeed reTerminal E1001 (7.5", 800×480); the web simulator switches resolutions (see `docs/hardware/DISPLAY.md`)
- **Active area:** 117.7 × 87.0 mm (module: 125.4 × 99.5 × 0.9 mm)
- **Power:** Rechargeable battery + solar panel, 1-2 refreshes per day
- **Connectivity:** Wi-Fi (ESP32); configure once via web UI
- **Form factor:** ~14×11cm enclosure (sized to fit GDEH0576T81 panel closely), solar panel on upper back, body-as-stand with a fold-out kickstand for ~12-15° tilt

The renderer produces eInk frame buffers (4 levels, 156,400 bytes for 920x680). Rendering is pure-functional — `POST /api/render` takes a config and returns a frame buffer — but the API as a whole is not stateless: since epic #77 it stores accounts, device pairings, and per-device config in SQLite, and the device-facing `/frames` path renders from that stored config given only a device id.

## Deployment

- **Single-port production:** Hono serves API + web UI from one port (default 4000). Will eventually be co-hosted alongside tiles- and webmap.dev on the same server.
- **API:** Hono, currently Node-bound — `better-sqlite3` is a native module, so the auth/pairing/config paths are not edge-deployable as-is. The pure render path (`POST /api/render`, `/api/preview`, `/api/validate`) has no state and would port to Workers/Deno/Bun unchanged.
- **Web app:** Public at https://www.infobento.com — anything in `packages/web/public/` (including setup-guide assets) is world-readable; never publish production pair codes or Device IDs.
- **GitHub repo:** Public. Use `review-requested` label on PRs to trigger Claude review. Anything committed is world-readable — never commit live pair codes, Device IDs, or bench Wi-Fi credentials.
