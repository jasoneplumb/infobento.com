# Changelog

## [0.2.0] - 2026-04-13

### Added

- Core types: `TextBoxConfig`, `BoxConfig`, `LayoutBox`, `LayoutResult`
- Layout engine: `calculateLayout()` with QR-aware height allocation
- Embedded 5x7 bitmap font (ASCII 32-126, 95 glyphs)
- Drawing primitives: `setPixel`, `drawHLine/VLine`, `drawRect`, `drawChar`, `drawText`, `drawTextWrapped`
- Text box renderer with border, label header, and word-wrapped content
- Placeholder renderer for unimplemented box types
- 28 tests across layout, drawing, font, and integration

### Changed

- `render()` now calculates layout and dispatches to box-type renderers
- Constants extracted to `constants.ts` to break circular imports

## [0.1.0] - 2026-04-13

### Added

- Monorepo scaffold: `@infobento/core`, `@infobento/renderer`, `@infobento/api`, `@infobento/web`
- GitHub Actions CI pipeline and Claude review workflow
- Husky hooks: pre-commit, commit-msg (conventional commits), pre-push
- Hono server with same-port architecture (API + static web UI)
- Documentation: CLAUDE.md, CONTRIBUTING.md, AGENT_POLICY.md, AGENTS.md, 12 docs/ files
- tux UX model: 23 artifacts (work roles, user classes, design principles, requirements, scenarios, wireframes)
