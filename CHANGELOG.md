# Changelog

## [0.8.1] - 2026-04-24

### Changed

- Default font size set to 38px (was 20px)
- Default boxes: Weather (Portland, OR), 8-Day Forecast (8 entries), Quote (Mark Manson)
- Default headers off
- Corner radius range extended from 0–5 to 0–10
- Device ID updated to `infobento-5.76`

## [0.8.0] - 2026-04-24

### Added

- 5 new box types: stocks, tasks, calendar, habit, worldclock — each with renderer, tests, 14x14 icons, types, and validation schemas
- Dynamic `FontMetrics` system replaces hardcoded font constants — all sizing derived from user-chosen body font size
- Content-aware quote height allocation — layout engine accepts height hints so quote boxes expand to fit wrapped text
- Antialiased rounded box borders using signed distance field (SDF) rendering
- `drawRoundedRect()` and `roundedRectSDF()` drawing primitives in `draw.ts`
- Grey background behind boxes (GRAY_LIGHT fill) with white box interiors
- Configurable corner radius (0–5) and display padding (0–10) with live web UI slider controls
- Font size max raised from 24px to 42px
- Display spec locked to Good Display GDEH0576T81 (5.76", 920x680, 198 DPI, SSD2677)

### Changed

- Layout engine derives padding and gap from `config.padding` instead of hardcoded constants (`BOX_DIVIDER_PX` and `DISPLAY_PADDING_PX` removed)
- Box gap matches edge padding for uniform spacing
- Split-pair boxes now have a gap between left/right halves
- Moon phase layout: bitmap vertically centered relative to text, divider clears whichever is taller
- Preview containers use CSS variable `--eink-radius` synced to framebuffer corner radius
- Preview shows full display area — orientation header labels ("Landscape 920x680") removed
- All docs updated from color eInk / Spectra 6 to B&W GDEH0576T81 spec

### Removed

- Per-box bottom divider lines (`drawHLine` rules) from all 16 box renderers — replaced by bordered boxes
- `BOX_DIVIDER_PX` and `DISPLAY_PADDING_PX` constants (now config-driven)

## [0.7.1] - 2026-04-23

### Fixed

- TTF rasterizer replaced with fast scanline fill — preview renders in ~200ms (was 504 timeout)
- Test suite runs in ~7s (was ~65s)
- Preview updates debounced by 150ms to avoid thrashing on keystrokes
- Empty-state message clears immediately when boxes are added

## [0.7.0] - 2026-04-23

### Added

- TrueType font rendering via opentype.js with Inter (OFL) — body 20px, hero 52px
- 4x supersampled anti-aliasing with 4-level grayscale output at native resolution
- 2-bit grayscale framebuffer (4 levels: white, light gray, dark gray, black)
- Gray level constants and optional `level` parameter on all drawing primitives
- `getPixel()` export for reading pixel values from framebuffer
- `setPixel()` now accepts gray level (0-3) instead of boolean
- Year progress bar with day count in date box
- CSS `image-rendering: pixelated` for crisp eInk preview

### Changed

- Display resolution upgraded from 240x200 to 920x680 (native)
- Replaced BSD-licensed Spleen bitmap font with Inter TrueType (OFL)
- Web preview now fetches server-rendered PNG from `/api/preview` (enables TTF rendering)
- Preview endpoint skips validation for live editing (renders placeholders for empty fields)
- Box headers: icons in light gray, labels in dark gray, divider rules in dark gray
- Date box simplified: removed week number/day-of-year options, added stacked layout with year progress
- Sun box simplified: stacked RISE/SET/DAY layout with aligned label columns
- Alphabetized add-box dropdown
- Box padding scaled for 920x680 resolution (4px → 16px)

### Removed

- Bitmap font data (5x7 body, 8x16 hero) — replaced by TTF rendering
- `showWeekNumber` and `showDayOfYear` config options from date box

## [0.6.0] - 2026-04-23

### Added

- New **8-day forecast** box type (`forecast3d`) with daily high/low temps and conditions
- `fetchForecast3D()` API helper using Open-Meteo daily forecast endpoint
- 7x7 pixel-art icon for 8-day forecast box header
- All box types (sun, aqi, moon, date, progress) now available in the add-box dropdown

### Changed

- Hourly forecast extended from 3 entries to 8 (label: "8hr Forecast")
- Daily forecast extended from 3 days to 8 (label: "8-Day Forecast")
- Location-based box headers now show the city name (e.g., "PORTLAND, OR" instead of "WEATHER")
- Applies to: weather, hourly forecast, daily forecast, sunrise/sunset, and air quality boxes
- Hourly forecast time/temp column spacing increased for readability

## [0.5.1] - 2026-04-23

### Fixed

- Claude Code review workflow: added `Read`, `Grep`, `Glob` to `--allowedTools` (reviews were silently producing zero comments); narrowed trigger to `labeled` event only (was triple-firing on PR creation)

### Added

- Production deploy workflow (`.github/workflows/deploy.yml`) modeled on webmap.dev: builds all packages + Vite, SSH deploys to DigitalOcean droplet, restarts systemd, health-checks `/api/health`, rollback on failure
- SSH retry helper (`scripts/ssh-retry.sh`) with exponential backoff
- Server-side deploy script (`scripts/deploy-infobento.sh`) with backup/extract/verify/rollback pattern

### Changed

- **REQ-009 upgraded to 2-bit grayscale**: v1 ships 4-level grayscale (black, dark gray, light gray, white) instead of 1-bit. All candidate panels support this natively at zero BOM cost. Enables anti-aliased fonts and tone-based visual hierarchy.
- Design principle renamed "1-Bit Elegance" → "Grayscale Elegance" with 4-tone hierarchy examples
- Two-Font Bitmap System principle updated: both fonts can be anti-aliased using grayscale edge pixels
- **REQ-012 updated**: IMU replaced with two mechanical tilt switches (zero standby current, ~$0.10 BOM)

### Documentation

- `.tux/project.json` fully audited: 22 stale color/clamshell/phone references fixed across description, requirements, design principles, scenarios, wireframes, hardware platform, market positioning, and campaign plan
- Round 11 annotation added to Round 10 RFC (#25)
- All open GitHub issues (#25, #36-39, #41-45) audited for stale color references and updated
- Issue #47 expanded: 21 panel candidates across 5 tiers with purchase links and spec pages, including budget 4.26" panels at $10-19 and 219 DPI
- Issue #52 created: 2-bit grayscale framebuffer + anti-aliased font rendering
- New issues: #47 (B&W panel sourcing), #48 (tilt switch hardware), #49 (auto-rotate software), #50 (SCAD enclosure), #51 (configurable dimensions)

## [0.5.0] - 2026-04-23

### Added

- 5 new box types: **date** (hero day number + day-of-week), **moon** (lunar phase with 20px bitmap), **sun** (sunrise/sunset via Open-Meteo), **aqi** (air quality + UV index via Open-Meteo), **progress** (year/custom range progress bar) (#41-45, PR #46)
- Web editor support for all 11 box types: type picker, config forms, live preview
- `fetchSunTimes()` and `fetchAirQuality()` in web API layer (Open-Meteo + Nominatim geocoding)
- 5 new 7x7 pixel-art icons for box headers (calendar, crescent, sunrise, leaf, progress bar)
- Moon phase computation from synodic period (reference epoch 2000-01-06T18:14Z)
- AQI category mapping (US EPA scale) and dominant pollutant display

### Changed

- **Collapsed dual-display to single-display model** (Phase 2, #29, PR #40):
  - Removed `DisplayId` type and `displayId` field from `BentoConfig` across all packages
  - Web editor: 2x2 grid → single column (preview on top, editor below)
  - localStorage schema bumped to v2 with backward-compatible v1 migration
  - CSS: grid layout → flex column, removed `.column-heading` and grid-area rules
- Claude Code review workflow: added `Read`, `Grep`, `Glob` to `--allowedTools` (was missing, causing zero review comments); narrowed trigger to `labeled` event only (was triple-firing)
- 73 → 100 tests (27 new tests for 5 box types; 1 removed: `displayId` validation)

### Strategic direction (Round 11, 2026-04-23)

- **V1 ships B&W only** (REQ-009) — color eInk deferred to v2. Phase 3 (#30-33) relabeled as v2.
- **Bento-box form factor** (REQ-010) — device sized ~18x12cm, golden-ratio display (1.618:1 target)
- **High DPI + minimal bezel** (REQ-011) — ≥200 DPI target, ≤3mm bezel
- **Tilt switch auto-rotate** (REQ-012) — two mechanical tilt switches, 4-orientation detection, zero standby current
- **Configurable display dimensions** (#51) — BentoConfig accepts optional width/height
- New hardware issues: B&W panel sourcing (#47), tilt switch hardware (#48), auto-rotate software (#49), SCAD enclosure (#50)

### Documentation

- Pivot Phase 1 strategic artifacts (#26, #27): README, hardware docs, architecture docs rewritten for counter-only
- Connectivity locked: Wi-Fi direct + PWA-only, ESP32-C3, captive-portal setup, no companion app
- Kickstarter copy draft committed (`docs/kickstarter-copy.md`)
- `.tux/project.json` fully audited and updated for Round 11 (B&W, bento, tilt switches, golden ratio)

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
