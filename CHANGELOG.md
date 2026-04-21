# Changelog

## [0.3.0] - 2026-04-21

### Added

- PNG preview endpoint `POST /api/preview` with optional `?scale=N` upscaling (#19)
- REQ-008: live PNG preview requirement for web config experience
- MagSafe clamshell form factor design — 320-degree hinge, three physical modes (phone-mounted, counter-standing, collapsed)
- Hardware platform decision: ESP32-C3, solar drip charger, MagSafe reverse-charge
- Value proposition: "See less. Know enough." — anti-phone positioning for $25 Kickstarter
- Dual-mode power budget: low-power counter mode (1-2x/day) and phone-mounted mode (minute-level partial refresh)
- Phone-back peek scenario and updated morning glance scenario for new form factor
- Display resolution finding: 240x200 (codebase) vs 296x128 (standard 2.9" panels)

### Changed

- Project phase advanced from `design` to `implement`
- README rewritten around MagSafe clamshell form factor and value proposition
- Hardware docs (display, power, BLE) updated for dual operating modes and ESP32-C3
- Architecture docs updated with physical modes table and new system overview
- "Zero Daily Interaction" design principle refined to "Zero Device Interaction"
- Device Owner role and Desk Decorator user class updated for new form factor
- API docs: preview endpoint updated from "planned" to implemented

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
