# Development

## Common Workflows

### Building

```bash
npm run build        # Build all packages (tsc -b with project references)
npm run typecheck    # Type-check only (no emit)
```

Packages build in dependency order: core -> data -> renderer -> api.
The web package builds separately via Vite.

### Testing

```bash
npm test             # Run all tests
npm test -- --watch  # Watch mode for TDD
```

Tests live alongside source files as `*.test.ts`.

### Linting & Formatting

```bash
npm run lint         # ESLint (strict TypeScript rules)
npm run format       # Auto-format with Prettier
npm run format:check # Check formatting without writing
```

## Coding Conventions

### Import Extensions

**Relative** imports in `core`, `data`, `renderer`, and `api` must include `.js`
extensions — `module: "Node16"` with no bundler means extensionless relative
imports fail at runtime:

```typescript
import { splitLeftFraction } from './constants.js';
```

**Cross-package** imports use the bare specifier. Each package exports only `"."`,
so a subpath import throws `ERR_PACKAGE_PATH_NOT_EXPORTED`:

```typescript
import type { BentoBox } from '@infobento/core';
```

The `web` package uses Vite's bundler and does NOT require extensions.

### Intent Documentation

Add intent headers to new files:

```typescript
/**
 * Intent: [Why this module exists]
 * Context: [Where it's called from]
 * Pattern: [Key architectural pattern]
 * Future: [Known limitations or plans]
 */
```

Use inline tags for decisions:

- `// tradeoff:` — What was sacrificed for what gain
- `// constraint:` — What limits the solution
- `// future:` — Known tech debt

See [docs/reference/INTENT_TEMPLATES.md](../reference/INTENT_TEMPLATES.md) for the full standard.

### Type-Only Imports

Use `import type` for type-only imports (enforced by `verbatimModuleSyntax`):

```typescript
import type { BentoBox } from '@infobento/core';
```
