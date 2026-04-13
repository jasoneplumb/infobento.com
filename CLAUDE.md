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
├── packages/renderer/  @infobento/renderer: 1-bit eInk frame buffer generation
├── packages/api/       @infobento/api: stateless pure-function cloud API
└── packages/web/       @infobento/web: web configuration interface (private)
```

## Module Boundaries

```
core (types, layout)  <──  renderer (1-bit framebuffer)  <──  api (stateless endpoints)
  ^
  └── web (config UI)
```

- `core` imports nothing from other packages
- `renderer` imports only from `core`
- `api` imports from `core` and `renderer`
- `web` imports from `core` only (calls API via HTTP, not direct import)

## Critical: .js Extensions Required

All TypeScript imports in `core`, `renderer`, and `api` MUST include `.js` extensions.
The project uses `module: "Node16"` with no bundler — extensionless imports fail at runtime.

```typescript
// Correct
import { render } from '@infobento/renderer/index.js';

// Wrong — will fail at runtime
import { render } from '@infobento/renderer';
```

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

InfoBento is a credit-card-sized portable eInk display:

- **Display:** 2.9" eInk, 240x200 pixels, 1-bit (black/white)
- **Power:** Rechargeable battery + solar panel, 1-2 refreshes per day
- **Connectivity:** Bluetooth Low Energy to phone; phone bridges to cloud API
- **Form factor:** Wallet-sized, solar panel on one side, PCB on the other

The renderer produces 1-bit frame buffers (6000 bytes for 240x200). The API is stateless and pure-functional — it takes a config, returns a frame buffer.

## Deployment

- **Web app:** Private during initial development. Will eventually be co-hosted alongside tiles- (Planned Activities) and webmap.dev on the same server.
- **API:** Stateless, edge-deployable. No server-side state.
- **GitHub repo:** Private. Use `review-requested` label on PRs to trigger Claude review.
