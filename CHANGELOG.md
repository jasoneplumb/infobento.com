# Changelog

## [Unreleased] — Pivot in flight

### Strategic pivot — counter-only color decorator (RFC #25)

The product is pivoting from the dual-display MagSafe clamshell to a single counter-only color eInk decorator. Phone-back, MagSafe, hinge, dual-display PCB, and the iOS background BLE risk are all being removed. Solar panel moves to the upper portion of the back side; no kickstand. Industrial design constrained to white housing, ≤4mm bezel, drop-resistant to 4 ft. Larger color eInk panel replaces the 1-bit 2.9" panel.

Phase work is tracked in GitHub issues #25–#38 under the `pivot/counter-color` milestone.

### Documentation

- `README.md` — rewrote Overview, Hardware, Architecture sections; removed Four Surfaces and Three Modes diagrams; added counter-only product story and form-factor sketch
- `docs/hardware/DISPLAY.md` — rewrote for color panel candidates, single-display form factor, single refresh mode
- `docs/hardware/POWER.md` — rewrote for single counter mode; removed MagSafe reverse-charge; updated power budget for color refresh + Wi-Fi
- `docs/hardware/BLE.md` — reframed as "Connectivity"; documented Wi-Fi-direct (likely) and phone-bridged BLE (fallback) options pending decision in #35
- `docs/getting-started/ARCHITECTURE.md` — updated system overview, data flow, and operating profile

## [0.4.0] - 2026-04-21

### Added

- All 5 MVP box types: countdown, weather, QR (qrcode-generator), quote, text
- Spleen 8x16 hero font embedded in renderer with `drawHeroText`/`drawHeroChar`
- Hero font + whitespace layout in all box renderers (replaces border-based design)
- Dual-display type system: `displayId: 'D' | 'P'` on BentoConfig
- Display toggle in web editor (D Phone / P Counter tabs)
- Client-side 1-bit canvas renderer in web editor (replaces CSS mock)
- localStorage persistence — config auto-saves and restores on page load
- JSON import button (completes export/import cycle)
- Vanilla JS web editor scaffold with reactive state (no framework)
- 128x296 portrait display resolution (standard 2.9" eInk panel)
- Preview images regenerated using real renderer pipeline
- OpenSCAD mockup for 3D printing (hardware/infobento.scad + STL)
- Physical mode diagrams: closed, peek 90°, counter ~100°, flat 180°
- Dual-display mode diagram with D/P/S/M surface labels
- 3-color (BWR) rendering prototype
- Font comparison: Spleen 8x16 vs Tamzen vs baseline

### Changed

- Display resolution: 240x200 → 128x296 (frame buffer 6000 → 4736 bytes)
- Form factor: 320° hinge → 180° standard friction hinge
- Price target: $25 → $30
- Battery placement: display half → solar half (grip flex safety)
- Folded thickness: ~8mm → ~7.2mm (dual display, thinner battery)
- Dual-display architecture: two 2.9" eInk panels back-to-back
- Preview script: 437 lines custom drawing → 230 lines render() calls
- Web editor: React stub → vanilla JS with reactive state
- Box renderers: borders → whitespace + thin rules + hero font

### Documentation

- Hardware design exploration (issue #22): component layout, GPIO allocation, BOM analysis
- 8 rounds of open question decisions captured in project model
- README rewritten for dual-display clamshell form factor
- All hardware docs updated (display, power, BLE, architecture)

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
