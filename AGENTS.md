# Repository Guidelines

## Project Structure

Monorepo managed via npm workspaces: `packages/core` (types, layout), `packages/renderer` (2-bit grayscale framebuffer), `packages/api` (stateless API), `packages/web` (React config UI). Documentation in `docs/`.

## Commands

- `npm install` — install dependencies (Node 20+/npm 10+)
- `npm run build` — compile all packages (tsc -b)
- `npm test` — run all tests (Vitest)
- `npm run lint` — ESLint all packages
- `npm run format:check` — Prettier formatting validation
- Quality gate: `npm run build && npm test && npm run lint && npm run format:check`

## Coding Style

- TypeScript strict mode, ES2020 target, no ES2022+ features
- `.js` extensions required in imports (except `web` package which uses Vite bundler)
- `import type` for type-only imports (`verbatimModuleSyntax`)
- ESLint (TypeScript strict) + Prettier (single quotes, trailing commas, 100-char lines)
- Intent headers on new files: Intent, Context, Pattern, Future
- Inline decision tags: `tradeoff:`, `constraint:`, `future:`, `pattern:`

## Testing

- Vitest, tests alongside source as `*.test.ts`
- Run from project root: `npm test`

## Commits & PRs

- Branch from `mainline` with `feature/`, `fix/`, `refactor/`, `docs/`, `test/` prefixes
- Conventional commits enforced: `<type>(<scope>): <description>`
- PRs target `mainline`, include passing CI, tests, and relevant docs
