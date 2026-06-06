# Intent Documentation Templates

Templates for adding intent-driven inline documentation throughout the codebase.

## Module/File Header Template

Use at the top of each module to explain its purpose:

```typescript
/**
 * Intent: [Why this module exists - 1 sentence]
 * Context: [Where it's called from, dependencies]
 * Pattern: [Key architectural pattern used]
 * Future: [Known limitations or planned improvements]
 */
```

### Example

```typescript
/**
 * Intent: Convert bento box layouts into eInk-compatible frame buffers
 * Context: Called by @infobento/api to generate display data sent to the device
 * Pattern: Pure functions — all rendering is deterministic with no side effects
 * Future: Add bitmap font rendering, icon set, Floyd-Steinberg dithering
 */
```

## Function/Method Rationale Template

Use for complex functions or non-obvious design decisions:

```typescript
/**
 * intent: [Why this function exists]
 * method: [How it accomplishes the goal - high level]
 * effect: [Measurable impact or performance characteristic]
 * context: [Where it's used in the system]
 */
```

### Example

```typescript
/**
 * intent: Create an empty (white) frame buffer for the target display
 * method: Allocates a Uint8Array sized for 2-bit-per-pixel packing (4 pixels/byte)
 * effect: (width * height) / 8 bytes — 156,400 bytes for 920x680
 */
```

## Inline Decision Comments

Use for tradeoffs and constraints:

```typescript
// tradeoff: [decision made] because [constraint/goal]
// constraint: [limitation that shapes the solution]
// future: [known tech debt or planned improvement]
```

### Examples

```typescript
// tradeoff: 2-bit (4 levels) for minimal power draw during refresh
// constraint: BLE MTU limits frame transfer to ~244 bytes per packet
// future: add partial refresh to update only changed bento boxes
```

## Semantic Tags Reference

- **`intent:`** — Why something exists (purpose, problem being solved)
- **`method:`** — How it works (high-level approach)
- **`effect:`** — Measurable impact (performance, power, correctness)
- **`context:`** — Where it fits in the system (dependencies, callers)
- **`tradeoff:`** — What was sacrificed for what gain
- **`constraint:`** — What limits the solution space
- **`future:`** — Known tech debt or planned improvements
- **`pattern:`** — Architectural pattern used (pure function, observer, etc.)

## Quick Start

### Adding Intent Headers to Existing Files

1. Read the file to understand its purpose
2. Fill out the module header template
3. Add inline decision comments for non-obvious code
4. Keep it concise — aim for 3-5 lines per header

### Creating New Files

1. Start with the module header template
2. Add intent comments before complex functions
3. Document tradeoffs inline as you make decisions
