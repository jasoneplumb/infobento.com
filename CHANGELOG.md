# Changelog

## [0.26.0] - 2026-06-08

### Added

- **Font Weight control.** A new slider sets body text weight across the full range of Inter static weights (Thin → Black, 100–900; default Regular), backed by all nine weight files. Headings and hero numbers render a few steps heavier to preserve hierarchy. The weight is threaded explicitly through the renderer's font metrics — no global state, `render()` stays pure — and the API validates it on a 0.1 step grid. (#105)

### Changed

- **Proportional text anti-aliasing.** Glyph edge coverage now maps proportionally across each text color's own tonal range instead of snapping to fixed thresholds and clamping to the fill color — so dark-grey text gets a real white→light→dark edge ramp rather than a flattened, harsh edge. Paired with **3× supersampling** (10 coverage levels vs the previous 4) for smoother curves at every size. (#105)
- **Dark render background.** The gaps and margins between boxes now fill dark grey so the white boxes float on a dark field, and the editor's preview backdrop is black. (#105)

## [0.25.1] - 2026-06-08

### Fixed

- Boxes that don't fit the panel (shown below the "won't fit" divider) are now marked with a **red accent** — card border, header rule, and focus/hover — at full strength, instead of being greyed out. They stay fully legible and editable. (#103)

## [0.25.0] - 2026-06-08

### Added

- **Adjustable forecast counts.** Hourly and Daily forecast boxes now have a −/+ stepper for how many hours/days to show — Hourly 1–24, Daily 1–20 (daily capped at Open-Meteo's 16-day limit), default 3. The renderer, fetch, and Zod validation all honor the configured count. (#102)
- **Grouped, always-available Add-box palette.** Box-type chips are organized into themed groups (Weather & Sky, Time & Dates, Personal, Fun & Discovery, Utility) and stay visible at all times; any box type can now be added more than once. Each chip has a hover × to hide it, and hidden chips collapse into a persisted "Hidden (N)" list that restores on click. (#102)
- **"Won't fit" editor indicator.** When a layout's content can't fit the panel, the box list de-emphasizes the dropped boxes and shows a divider naming them, updating live per orientation. (#102)

### Changed

- **Box headers show the editor label + a font-scaled icon.** With "Show Box Headers" on, every box renders its editor label verbatim (its own case) beside the box-type icon, which now scales to the font size instead of a fixed 28px. Default labels are durable ("Hourly Forecast" / "Daily Forecast") regardless of count. A shared `drawBoxHeader` helper removes the header code previously duplicated across all box renderers. (#102)
- **Temperatures show just the degree symbol** ("62°", "H:68° L:55°"), with the value following the IP locale — °F values in the US (and a few territories), °C elsewhere. The weather box is more compact: the condition wraps one word per line beside the hero temperature. (#102)

### Fixed

- **Over-stuffed layouts no longer lose part of a merged row or render invisible boxes** on short panels (e.g. the reTerminal E1001 in landscape). The layout caps visual rows (not raw boxes) and drops overflow rows whole at a row boundary — never severing a merged pair or starving a box to 0px — based on content-aware height. (#102)
- **The eInk preview no longer clips behind the editor.** A wide landscape preview scales to fit its cell (via `max-width` + `aspect-ratio`) instead of being cut off on the right. (#102)

## [0.24.0] - 2026-06-07

### Changed

- **opentype.js upgraded 1.3.4 → 2.0.0.** The 2.x release runs GSUB layout substitution inside `Font.getPath`, which throws on Inter's unsupported lookup type (6 / substFormat 2) and would break all TTF text rendering. The renderer now positions each glyph via `glyph.getPath` through a shared `walkGlyphs` helper (advance + kerning applied, composite glyphs resolved) — behavior-neutral versus 1.x. (#101)
- Dependency maintenance: safe in-range npm updates applied, and Dependabot now ignores npm major bumps so they can be migrated manually. (#99)
- CI: `actions/setup-node` bumped 4 → 6 and `actions/checkout` bumped 4 → 6. (#94, #95)

## [0.23.2] - 2026-06-07

### Fixed

- Exported config JSON now preserves merged rows. `exportJSON` had dropped `split`/`splitRatio`, so an export→import round-trip lost every merged row and its divider position. Export and persistence now share one serializer, and import also restores `fontSize`/`cornerRadius`/`padding`. (#98)

## [0.23.1] - 2026-06-07

### Added

- Standard GitHub community-health files: Code of Conduct (Contributor Covenant 2.1), `SECURITY.md`, pull-request and issue templates, Dependabot config (weekly npm + GitHub Actions updates), and `CODEOWNERS`. (#93)

## [0.23.0] - 2026-06-07

### Added

- **Open-source-hardware licensing** — Apache-2.0 for software (`LICENSE`), CERN-OHL-P-2.0 for hardware (`hardware/LICENSE`), and CC-BY-4.0 for docs (`docs/LICENSE`); all three permit building and selling devices from the design. `LICENSING.md` explains the split and SPDX identifiers were added to every `package.json`. (#92)
- **Simulator display-resolution selector** — the web preview switches panels via a `DEVICE_PROFILES` list in `@infobento/core` (default: Seeed reTerminal E1001 7.5" 800×480; also the 5.76" GDEH0576T81 920×680). The preview renders at the panel's **true physical size** (96px = 1in), so a lower-resolution 7.5" panel correctly appears larger than the 5.76" one. `renderBoth()` now derives both orientations from the selected panel.
- **Merged-row divider slider** — `splitRatio` is now a numeric width percentage (20–80) with a fine slider instead of three fixed positions; legacy 1/2/3 values migrate to 33/50/67.
- **Location rows default to your location** — weather, forecast, sunrise/sunset, and air-quality rows auto-fill from IP-based detection (no permission prompt) on startup and when added; the config form then fetches data automatically.

### Changed

- **Display described neutrally as "eInk"** — the color-vs-monochrome decision is tabled; dropped "B&W" / "2-bit grayscale" product claims across the docs, `CLAUDE.md`, and the web UI.
- **Reconciled all documentation and the project model to the 5.76" GDEH0576T81 spec** (920×680, 198 DPI, SSD2677) and removed the round-by-round design-history scaffolding so the docs present only the current design.
- **Editor add-box chips** are hidden once that box type is in use, and now flow directly after the boxes instead of being pinned to the bottom of the column.
- Prototyping now targets the off-the-shelf Seeed reTerminal E1001 (7.5", 800×480) with the GDEH0576T81 as the production target (`docs/hardware/DISPLAY.md`).

### Removed

- **Sensor / presence / interaction bundle** (Core AQ + Presence) and its docs (`docs/hardware/SENSORS.md`, the paired-system RFC) — the product is a calm dashboard.
- **Box-height S/M/L (weight) controls** — content-aware auto-sizing supersedes them.
- Dead prototype editors (`prototypes/`).

### Fixed

- `splitRatio` Zod validation now accepts the numeric percentage (was hard-coded to 1/2/3, which would reject the new slider values).
- Flaky `auth/session` signature test made deterministic.
- Simulator landscape preview no longer clipped by the editor column.
- Claude review workflow tool allowlist fixed so PR reviews post reliably.

## [0.22.0] - 2026-04-29

### Added

- **Device-pull config and frame endpoints** — `GET /api/device/:id/config` returns the bound `BentoConfig` JSON; `GET /api/device/:id/frame?orientation=landscape|portrait` returns the rendered 2-bit framebuffer bytes (~157 KB per orientation). Both endpoints carry `Last-Modified` headers and honor `If-Modified-Since` with `304 Not Modified` (second-precision compare). The device id is the bearer secret (no auth header — long opaque token, treated like an API key). Per-device-id token-bucket rate limiter at 10/min in-memory, returns `429` with `Retry-After: 60` when exceeded. New `packages/api/src/device.ts` (pure helpers) + `packages/api/src/rate-limit.ts` (token bucket); 21 new tests cover 200/304/404 paths, rate-limit enforcement, corrupt-config 500, orientation default. Closes #75. Part of epic #77 (SaaS-default hosting).

### Documentation

- Reconciled `README.md`, `docs/product-brief.md`, and `.tux/project.json` with the v0.21.0 code: 18 box types (no longer mentions removed `tasks`/`worldclock`), correct 8-hour / 8-day forecast labels, corner radius 0–10, version v0.21.0, and a Round 13 implementation note covering v0.15.0 → v0.21.0 (auth, type switcher, tasks/worldclock removal, stocks duration, location button, chip rail).

## [0.21.0] - 2026-04-28

### Changed

- **Add box chips** — replaces the two-step select + "Add Box" button with a wrapping row of pill-shaped chips, one per box type sorted alphabetically. Single click adds a box directly with no intermediate step.

## [0.20.0] - 2026-04-28

### Added

- **Location button on all location fields** — weather, forecast, 3-day forecast, sun, and AQI boxes now show a small location icon inline with the LOCATION label. Clicking it calls ipapi.co (no browser permission required) to detect the device's city via IP and fills the field immediately, also propagating to any other empty location boxes in the layout.

## [0.19.0] - 2026-04-27

### Added

- **Duration shown on rendered stock box** — the change line now appends ` · 1mo` (or whichever preset is selected) after the change/percent so a `+2.45 (+1.23%) · 1mo` move is unambiguous about its time horizon. No suffix when the box has no duration set, preserving the prior look for older configs.

## [0.18.0] - 2026-04-27

### Added

- **Stocks duration selector** — every stocks box now carries a `Duration` dropdown alongside `Symbol`, with seven presets: 1 Day (default), 5 Days, 1 Month, 3 Months, 6 Months, 1 Year, 5 Years. Changing the duration triggers a debounced refetch and updates the change/percent against that range's baseline. New `StockDuration` type, `STOCK_DURATIONS` preset list, and `DEFAULT_STOCK_DURATION='1d'` exported from `@infobento/core`; Zod-validated. `/api/stocks` accepts a `duration` query parameter and maps it to Yahoo Finance `range`/`interval` pairs (`1d→2d/1d`, `1y→1y/1wk`, `5y→5y/1mo`, etc.); change is computed against `meta.chartPreviousClose` for `1d` and against the first non-null close in the returned series for longer ranges.

## [0.17.0] - 2026-04-27

### Added

- **Landscape preview toggle** — preview shows one orientation at a time (portrait by default), swapped by a new "Landscape" checkbox in the preview controls. Both PNGs are still fetched in one round-trip so the toggle is instant. Replaces the always-on dual-preview layout.

### Changed

- **Editor cards reflow horizontally and tighten vertically** — the box-config form inside each card uses flex-wrap, so multi-field forms (date+label, city+entries, etc.) sit side-by-side when there's room and stack only on narrow widths. Tighter padding/labels/inputs and a 40px-min textarea (down from 72px) let several boxes fit on screen without scrolling at typical desktop widths.

### Documentation

- Reconciled `README.md`, `docs/`, and `.tux/project.json` with the actual code: 18 box types (was 15/17, with stale `tasks`/`worldclock` and missing `horoscope`/`joke`/`onthisday`); `forecast3d` correctly described as 3-day; dropped phantom "ESP32-L" mentions; surfaced tilt-switch hardware (REQ-012) in README and POWER.md; removed stale "Mid-pivot status" section from `ARCHITECTURE.md` (`DisplayId` is gone); aligned bezel spec at ≤4mm; bumped REQ-001 from "3-6" to "up to 10" boxes to match `MAX_BOXES`.

## [0.16.0] - 2026-04-26

### Added

- **In-place box type switcher** — every box-card header now carries a `<select>` that swaps the box's type without disturbing layout. `split` partner, `weight`, `splitRatio`, and ordering are preserved; `config` is reset to the new type's defaults; the label is overwritten with the new default only when it still matches the old default (so a user-edited label like "Today" survives a type change). New `changeBoxType(id, newType)` action in `state.ts`; `LABELS` exported as `BOX_TYPE_LABELS`. Tests cover type+config reset, default-label overwrite, custom-label preservation, layout preservation, and no-op self-swap. (#88)
- **Text box honors `\n`** — `drawTextWrapped` now splits on explicit newlines first and word-wraps within each segment, preserving blank lines from consecutive newlines. `countWrappedLines` (used by content-aware layout) gets the same treatment so multi-line text reserves the right height. Lets a single Text box function as a one-item-per-row list. (#84)

### Removed

- **Tasks** and **World Clock** box types removed end-to-end. A device that refreshes once or twice a day can't truthfully show a clock, and a checkbox list is overkill on a passive surface — newline-delimited text in a Text box now does that job (see above). 17 → 15 box types across `@infobento/core`, `@infobento/renderer`, `@infobento/web`. (#84)

### Changed

- `claude-review` GitHub Action `--max-turns` raised from 10 to 25 — medium-sized PRs (4–5 files across two packages, plus inline comments) routinely needed more than 10 turns. (#86)

### Notes

- Pre-existing user configs containing `tasks` or `worldclock` boxes will fail Zod validation on `/api/render` and render as placeholder boxes in the editor's preview. Acceptable break — pre-1.0, single-user product.

## [0.15.0] - 2026-04-26

### Added

- **SQLite storage layer** for the SaaS hosting tier — `accounts` and `devices` tables in a single file at `/var/lib/infobento/data.db` (override via `INFOBENTO_DB_PATH`). Helpers for account creation/lookup, device pair-code claim (idempotent per account, rejects cross-account claims), config write, and per-account device listing. Schema accommodates the planned passkey + OAuth columns without future migration. Foundation for epic #77. (#72)
- **Passkey + OAuth authentication** — `@simplewebauthn/server` for WebAuthn (registration + authentication ceremonies, sign-counter rollback rejection with 0→0 pass-through), `jose` for OIDC + PKCE flows for Sign in with Apple and Google. HMAC-signed session cookies (`{account_id, exp}`, 90-day TTL, HttpOnly, SameSite=Lax, Secure in production) decoupled from credential type. Stateless 5-minute challenge cookies bridge `/options`↔`/verify` and `/start`↔`/callback` without a server-side store. Account upsert surfaces a `linkedToExistingEmail` flag so the editor can confirm before linking, never silently merges. (#73)
- Seven new auth endpoints in `@infobento/api`: `POST /api/auth/passkey/register/{options,verify}`, `POST /api/auth/passkey/login/{options,verify}`, `GET /api/auth/oauth/{apple,google}/{start,callback}`, `POST /api/auth/signout`, `GET /api/auth/session`.

### Changed

- Production deploy workflow now forwards `SESSION_SECRET`, `RP_ID`, `RP_ORIGIN`, `OAUTH_REDIRECT_BASE`, and the Apple/Google OAuth secrets from GitHub secrets. The deploy script writes them to `/etc/infobento/auth.env` (mode 640, root:www-data) for the systemd unit to pick up via `EnvironmentFile`; values omitted from a given run preserve their prior value rather than wiping.
- README documents the new env vars and Apple Developer / Google Cloud OAuth setup for self-hosters.

### Notes

- Phase 2 of epic #77 (SaaS-default hosting). Remaining sub-issues: #74 pair-code claim flow, #75 device-pull config/frame endpoints, #76 web editor account binding.
- 30 new tests in `packages/api/src/auth/` cover session sign/verify (tampering, expiry, missing/short secret), challenge type-tag binding, passkey config + sign-count replay defense, and OAuth callback paths (state mismatch, fresh account, email link, idempotent re-sign-in, audience mismatch, provider error) via local JWKS + injected fetch.

## [0.14.0] - 2026-04-25

### Added

- **Bundled local fallback** for `/api/quote`, `/api/joke`, `/api/horoscope` proxies — when the upstream provider fails (network, non-2xx, empty), proxy returns a random matching entry from a built-in JSON set with `fallback: true`. Bundle: 243 quotes (filtered to ≤120 chars from quotable mirror, multi-tag), 37 jokes (Programming/Misc/Pun via JokeAPI safe-mode), 30 evergreen sign-agnostic horoscope readings (#71)
- Curated 5-box first-time-user default: `[Date | Weather]` merged + Forecast + Quote + On This Day, all auto-populated on first render. Replaces dev-test mocks (Portland weather + sample task/quote) (#70)

### Changed

- Geolocation hook (`detectLocation`) now triggers when the weather city is empty, not when it equals `Portland, OR` — supports the new empty-by-default config
- `npm run build` chains a `node scripts/post-build.mjs` step that copies non-`.ts` static assets (the fallback JSON bundles) from each package's `src/` into `dist/`. ESLint config ignores `**/*.mjs` matching the existing `.js`/`.cjs` convention

### Notes

- Fallback bundle came in at ~50KB total (Round 12 Q3 estimated ~180KB; lighter because of the quote-length filter + smaller-than-spec joke / horoscope sets)

## [0.13.0] - 2026-04-25

### Added

- Wired 5 box types (stocks, tasks, calendar, habit, worldclock) into the web editor — they shipped as renderers in v0.8.0 but only became user-configurable now (#53)
- Add Box dropdown gains: Calendar, Habits, Stocks, Tasks, World Clock
- List-editor primitive in `box-config.ts` (`buildListField`) used by tasks/calendar/habit/worldclock; per-row remove + bottom Add button
- Generic `updateConfigList` / `appendToConfigList` / `removeFromConfigList` mutators in state — in-row edits keep input focus; add/remove rows trigger setState rebuild

### Changed

- Layout engine now applies content-aware minimum heights to **all** box types, not just quote/horoscope/joke/onthisday (#54). Each box reports its renderer-specific height (header + content + padding); short-content boxes shrink so list-heavy boxes get the space they need.
- `extractWrappedText` replaced with a comprehensive `computeMinHeight` helper covering all 17 types

### Notes

- Stocks live price fetch is intentionally deferred — no free no-key quote API exists today. Box renders `No data` until a future release wires one in.

## [0.12.0] - 2026-04-25

### Added

- **On This Day** box: surfaces a Wikipedia event/birth/death/holiday for today's UTC date. Category dropdown (Events, Births, Deaths, Holidays, All) re-fetches on change. Server picks one entry randomly so the client never sees the full Wikipedia day payload (#61). Completes epic #62.
- "On This Day" entry in the Add Box dropdown
- On This Day box auto-resizes to fit text, matching Quote/Horoscope/Joke behavior

## [0.11.0] - 2026-04-25

### Added

- **Horoscope** box: pick your zodiac sign (12 options) and refresh for a daily reading via api-ninjas (#59)
- **Joke** box: optional category filter (Programming, Misc, Pun, Dark, Spooky, Christmas) with safe-mode and content blacklist always on, via JokeAPI (#60)
- Quote box optional **tag steering** — comma-separated tags (e.g. `wisdom, life`) steer random selection
- Quote box tag changes auto-refresh debounced (~500ms after last keystroke)
- "Horoscope" and "Joke" entries in the Add Box dropdown

### Changed

- Quote provider switched from `zenquotes.io` to the actively-hosted `api.quotable.kurokeita.dev` mirror — enables tag filtering and improves reliability
- `fetchQuote` retry-for-length loop dropped; server enforces `maxLength` upstream so a single fetch suffices
- Horoscope and Joke boxes now expand to fit their text, matching Quote box behavior

### Fixed

- Reordering an unpaired box around a split pair no longer strips the pair's split markers (which made the merge buttons disappear); existing corrupted localStorage state is repaired automatically on next load
- CHANGELOG.md prettier compliance — escape `*` so CI format check passes

## [0.10.0] - 2026-04-24

### Added

- Merge/split box pairs: "Merge into row" button between adjacent boxes creates a side-by-side split pair; "Split apart" undoes it
- [L]/[R] badges and blue accent group border on paired boxes in the editor
- Adjustable box height weight (S/M/L buttons on each box card) for proportional height allocation
- Adjustable split ratio (left arrow/equal/right arrow) on merged pairs for 1:3, 1:2, 2:3 width distribution
- +/- stepper buttons replace range sliders for font size, corners, and padding (better mobile UX)
- Preview and editor side-by-side on wide screens (>=1024px)
- Add box toolbar moved to bottom of editor

### Changed

- Previews stacked vertically (portrait first, landscape below)
- Show Box Headers toggle moved after stepper controls
- Layout engine distributes height by total weight instead of even split
- Merged row height uses max weight of the two boxes in the pair
- Quote boxes are always content-sized (S/M/L controls hidden)
- Quote author rendered as "— Name" on its own line in light grey (em dash, no wrapping issues)
- Quote height hints account for split pair width and correct line height

### Fixed

- S/M/L weight buttons now trigger full re-render (was preview-only)
- Quote height hint uses correct drawTextWrapped line height (fontSize \* 1.3)
- Right box in split pair was using left box's weight for height calculation

## [0.9.1] - 2026-04-24

### Fixed

- Quote box layout: author attribution positioned directly after wrapped text instead of at bottom of allocated space
- Quote height hint respects showHeaders flag and removes extra padding, giving weather/forecast boxes more vertical space at large font sizes
- drawTextWrapped returns actual pixel height consumed (was void)

### Added

- Product brief (`docs/product-brief.md`) — hardware, software, rendering, box types, power budget, competitive positioning
- Design brief (`docs/design-brief.md`) — work roles, user classes, design principles, requirements, scenarios, wireframes, config delivery, rendering pipeline

### Changed

- Enclosure shrunk from ~18x12cm to ~14x11cm to fit GDEH0576T81 panel closely
- Config delivery: captive portal for first-time setup + cloud poll for OTA updates
- Server-side rendering with device-side framebuffer caching for offline resilience

## [0.9.0] - 2026-04-24

### Added

- Debounced auto-fetch (500ms) on all city inputs — weather, forecast, forecast3d, sun, aqi update live as you type
- Auto-fetch random quote when quote box is added with empty fields
- Browser geolocation on first load — detects user's city and populates default boxes with real local data
- Bento box grid SVG favicon (replaces default React/Vite logo)
- CSS for `.weather-status` and `.btn-random-quote` elements
- Mobile-responsive preview controls — sliders wrap instead of overflowing on narrow viewports

### Changed

- Three-tier text contrast: hero text in dark grey (large, doesn't need max contrast), important body text in black, supporting metadata in light grey
- Portrait preview shown first, landscape second
- Box card headers: label input shrinks on mobile, remove button stays visible
- All docs updated from 1-bit to 2-bit grayscale terminology
- Kickstarter copy updated from color eInk to B&W GDEH0576T81 spec
- Consent dialog simplified — product descriptions removed, version bumped

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
