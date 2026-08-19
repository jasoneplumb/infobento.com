# Testing

## Framework

- **Vitest 3.x** — Fast, ESM-native test runner
- Tests live alongside source: `packages/*/src/**/*.test.ts`
- Run from project root: `npm test`

## Running Tests

```bash
npm test                    # All tests, single run
npm test -- --watch         # Watch mode (TDD)
npm test -- packages/core   # Filter by path substring
```

## Writing Tests

### File Naming

Place tests next to the code they test:

```
packages/core/src/
├── layout.ts
├── layout.test.ts    # Tests for layout.ts
├── index.ts
└── index.test.ts
```

### Test Style

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule.js';

describe('myFunction', () => {
  it('should handle the happy path', () => {
    expect(myFunction(input)).toEqual(expectedOutput);
  });

  it('should handle edge cases', () => {
    expect(myFunction(edgeInput)).toEqual(edgeOutput);
  });
});
```

### What to Test

- **Core:** Layout calculations, type validation, config parsing
- **Data:** Provider fetch/parse logic, cache behavior, upstream error handling
- **Renderer:** Frame buffer generation, pixel correctness, boundary conditions
- **API:** Endpoint handlers (pure functions), validation, error cases
- **Web:** Component behavior (not implementation details), user workflows

### Testing Pure Functions

Most of the codebase is pure functions, which makes testing straightforward:

```typescript
// Input -> expected output, no mocks needed
const result = render(config, device);
// Packed 2 bits per pixel, 4 pixels per byte
expect(result.data.length).toBe((device.width * device.height) / 4);
```
