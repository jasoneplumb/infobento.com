---
title: 'InfoBento Design Brief'
subtitle: 'UX model, requirements, and design decisions'
date: 'June 2026 (Round 18 revision, 2026-06-06)'
---

# InfoBento Design Brief

_A bento dashboard that can sense the room._

**Domain:** Consumer electronics
**Phase:** Campaign (pre-Kickstarter), Round 18 — 5.76" multi-box dashboard with Core AQ + Presence
**Version:** v0.22.0

---

## Round 14 / 15 / 16 amendment (2026-04-29)

This brief was authored before the late-April hardware pivots. Sections below remain the historical baseline; the changes that override them are:

**Round 14 (sensor pivot vs TRMNL):**

- Tagline: "See what matters. Skip the spiral." retired for this campaign (may return for accessory marketing)
- Added built-in sensor bundle (SCD41, BME688, VEML7700, AM312 PIR), ~$24 added BOM
- Solar dropped from marketing story; USB-C charging once every ~6 months
- Display: 5.76" 920×680 → 7.5" 800×480 (visibility math)
- TRMNL moat verified by their own SDK docs (plugins fundamentally cannot read on-device sensors)

**Round 15 (AQ-monitor repositioning following Seeed reTerminal E entry):**

- Seeed reTerminal E1001 ($69, 7.5" B&W, ESP32-S3, temp/humidity + 8-pin GPIO header for sensor expansion + native TRMNL/Home Assistant/ESPHome support) collapsed the dashboard-with-sensors positioning
- Repositioned as a calm AQ monitor with built-in dashboard, not a dashboard with sensors
- New competitor set: Aranet4, AirGradient ONE, Awair Element, AirThings View Plus
- Sensor bundle revised: added SEN54 (PM1/PM2.5/PM10), dropped VEML7700 + AM312-as-presence — bundle now SCD41 + BME688 + SEN54
- Pricing: $129–$179 (up from $39–$69)
- Persona priority: Asthma Parent (PRIMARY), WFH (secondary), Tight-Envelope (tertiary); Desk Decorator/Glancer/Gift Giver dropped
- Tagline: "The air monitor that doesn't look like an air monitor."

**Round 16 (presence + interaction layer):**

- Added HLK-LD2410C mmWave presence radar + AM312 PIR (cheap interrupt + radar power-gating) + hardware privacy switch on back
- Added LIS3DH accelerometer (knock-to-dismiss), one front tactile button, single dimmable RGB LED for across-room glance
- Sensor + interaction BOM: ~$56 added (was ~$44 in Round 15)
- New killer use case: alerts escalate only when CO2/PM threshold AND someone has been in the room ≥30 min (presence-aware contextual escalation — no other AQ monitor matches this)
- New tagline option: "The air monitor that knows when your kid's actually breathing the air."
- New design principles: "Presence-Aware Air Quality" + "Privacy by Hardware"
- Battery sizing: 1500 mAh → 2000 mAh (presence sensor average draw ~285 µA pushed it up)
- New: paired pocket SKU reserved for v2 (BLE-paired with counter, syncs away-from-home exposure on return) — full protocol design in `docs/rfcs/round-16-presence-aware-paired-system.md`

For full pivot context see `.tux/project.json` (Round 14 / 15 / 16 notes), the marketing plan at `~/.claude/plans/using-several-agents-develop-radiant-hearth.md`, and the paired-system RFC at `docs/rfcs/round-16-presence-aware-paired-system.md`.

---

## Round 17 amendment (2026-05-07) — display decision SUPERSEDED by Round 18

> **Superseded:** The Round 17 display + product-shape pivot below (Waveshare 2.13" / 250×122 / mini grid / 3-/4-line SPI) is no longer the active direction. See the **Round 18 amendment** for the canonical 5.76" GDEH0576T81 multi-box dashboard. Round 17's **Core AQ + Presence** hardware scope is retained.

Round 17 superseded the 7.5" AQ-monitor direction. The Round 17 selected direction was:

- **Positioning:** Tiny Bento Dashboard
- **UI model:** Mini Grid _(superseded — Round 18 restores the multi-box bento dashboard)_
- **Hardware scope:** Core AQ + Presence _(retained in Round 18)_
- **Display:** Waveshare 2.13" e-Paper Rev 2.1, 250×122, black/white _(superseded — Round 18 restores Good Display GDEH0576T81, 5.76", 920×680)_
- **MCU:** ESP32-class controller driving the panel over 3- or 4-line SPI _(MCU class retained; panel interface superseded with the GDEH0576T81 / SSD2677)_
- **Product implication:** The device is dashboard-first again. AQ and presence readings are local context and alert inputs, not the entire product category. _(retained)_

---

## Round 18 amendment (2026-06-06)

Round 18 supersedes the Round 17 **display** and **product-shape** pivot and restores the canonical 5.76" panel that the codebase and `CLAUDE.md` never moved off. Round 17's **Core AQ + Presence** sensor and interaction work is retained in full. The selected direction is:

- **Positioning:** Bento dashboard that can sense the room (dashboard-first; AQ + presence are local context and alert inputs)
- **UI model:** Multi-box bento dashboard — up to 10 boxes (`MAX_BOXES=10`), multi-column, with high-priority box / full-screen alert takeover retained. NOT a 2–4 box mini grid.
- **Hardware scope:** Core AQ + Presence (unchanged from Round 17)
- **Display:** Good Display **GDEH0576T81**, 5.76" B&W eInk, **920×680 px**, **198 DPI**, **SSD2677** driver IC, 2-bit grayscale (4 levels). Framebuffer **156,400 bytes**. Refresh 1–2×/day, 0.75 s full / 0.3 s partial. Active area 117.7×87.0 mm; module 125.4×99.5×0.9 mm.
- **Enclosure:** white monolithic housing ~14×11 cm sized to fit the GDEH0576T81 closely; thin bezel ≤4 mm; body-as-stand with ~12–15° tilt.
- **MCU:** ESP32-class, Wi-Fi; captive-portal setup; no companion app v1; config via the infobento.com web editor.
- **Power:** rechargeable battery + solar panel on the upper back; ~1–2 refreshes/day.
- **Privacy:** sensor + presence data stays on-device; the cloud renderer never sees readings.

Treat this Round 18 amendment, `README.md`, `CLAUDE.md`, and `docs/product-brief.md` as canonical. All CURRENT spec/requirement statements below are 5.76" GDEH0576T81; any remaining 2.13"/250×122/Waveshare/mini-grid references are historical record only.

---

## 1. Work Roles

### Device Owner

Individual who owns an InfoBento display and places it on a counter, shelf, or windowsill.

**Responsibilities:**

- Configure bento boxes via web UI
- Place device on a counter or shelf with the solar panel exposed to indirect window light
- Complete first-time captive-portal Wi-Fi setup
- Update configuration occasionally as priorities change

### Gifter

Person who purchases and pre-configures an InfoBento as a gift for someone else.

**Responsibilities:**

- Select and order device
- Configure initial bento layout for recipient
- Share config JSON with recipient or pre-load via captive-portal setup

---

## 2. User Classes

### Desk Decorator (Primary)

Person who values aesthetic, minimal desk or counter accessories and wants a bento-box-sized B&W eInk display that shows a multi-box dashboard of useful status boxes -- standing on its own, the body is the stand.

**Goals:**

- Have a visually pleasing desk or counter accessory that is also functional
- Show countdown to meaningful events
- Display a personal link or QR code for networking
- A device that charges itself near a window without any cables

**Frustrations:**

- Digital photo frames are too large and power-hungry
- Sticky notes with countdowns look unprofessional
- No small, elegant way to display a personal QR code
- Desk gadgets always need cables or batteries

### Daily Glancer (Secondary)

Busy professional who wants a calm passive display of key daily info -- weather, next event, a quote -- visible at a glance from across the room. The founder is this user.

**Goals:**

- See today's weather and schedule without picking up a phone
- Reduce screen time by offloading ambient info to a passive display
- Customize what info matters most to them

**Frustrations:**

- Checking phone for simple info leads to distraction rabbit holes
- Smart home displays are too expensive and power-hungry
- Existing e-paper gadgets are not customizable
- Every phone interaction is an attention trap

### Gift Giver

Someone who wants to give a thoughtful, personalized tech gift that is useful without being overwhelming.

**Goals:**

- Give a unique gift that feels personal and curated
- Pre-configure the device so the recipient can use it immediately
- Gift something that does not require technical knowledge to enjoy

**Frustrations:**

- Most tech gifts require complex setup
- Generic gifts lack personal touch
- Subscription-based gifts feel like an obligation

---

## 3. Design Principles

### Minimal Device Interaction

> InfoBento remains glance-first. A button or knock gesture may dismiss an alert or acknowledge an escalation, but the core loop is still configure once, glance often.

InfoBento has one front tactile button and LIS3DH knock-detect (added in Round 16) so a user can dismiss a presence-aware alert without a phone. Interaction stays optional and bounded; it still charges via solar passively and refreshes on schedule.

| Do                                             | Don't                             |
| ---------------------------------------------- | --------------------------------- |
| Glance at counter display from across the room | Require button press to refresh   |
| Knock or button-press to dismiss an alert      | Dedicated companion app           |
| Solar charging near a window without cables    | Manual charging schedule or cable |
| Captive-portal first-time setup, no app        | Notification stream or buzzer     |

### Pure Function Architecture

> The API must be stateless -- same config in, same frame buffer out, every time.

No server-side state, no user accounts, no databases. Config lives on the client. Device caches last framebuffer in flash for offline resilience.

### Grayscale Elegance

> Four shades -- black, dark gray, light gray, white -- used with intention. Every tone earns its place.

The constraint is tight enough to feel intentional: four shades, not a gradient. Think newspaper print, not a photograph. The GDEH0576T81 renders 2-bit grayscale (4 levels) natively.

| Level      | Use                                                  |
| ---------- | ---------------------------------------------------- |
| Black      | Important body text (conditions, entries, names)     |
| Dark gray  | Hero/display text (large, doesn't need max contrast) |
| Light gray | Supporting metadata (H/L, author, streaks)           |
| White      | Box interior background                              |

### Free by Default

> All box types must work without accounts, API keys, or subscriptions.

All 18 box types use free data sources or local computation. Weather, forecast, sunrise/sunset, and air quality use Open-Meteo. Quotes use ZenQuotes. Everything else is pure local computation. On-device AQ and presence readings are computed locally and never leave the device.

### Web-Only Configuration

> InfoBento is configured exclusively from a web browser. No native phone app required.

The web editor at infobento.com is the only configuration surface. No companion iOS or Android app for v1. This removes ~6+ months of engineering scope and the iOS background BLE risk.

### Solar-Powered Counter Display

> Monolithic body, no hinge, no kickstand. Body is the stand.

White monolithic enclosure ~14×11 cm sized to fit the GDEH0576T81 (5.76", 920×680) closely, with a thin bezel (≤4 mm) and ~12–15° body-as-stand tilt. Solar panel on the upper back. Sensor grille (SCD41 / BME688 / SEN54), back-mounted hardware privacy switch, front tactile button, RGB LED, and battery layout are added by the Core AQ + Presence scope and need an industrial-design pass.

---

## 4. Requirements

| ID      | Statement                                                   | Priority | Status   |
| ------- | ----------------------------------------------------------- | -------- | -------- |
| REQ-001 | User can configure 3-6 bento boxes via web interface        | Must     | Accepted |
| REQ-002 | Device syncs via Wi-Fi direct, no companion phone app       | Must     | Accepted |
| REQ-003 | Display refreshes 1-2x/day on solar power alone             | Must     | Accepted |
| REQ-004 | 18 box types without user accounts, up to MAX_BOXES=10      | Must     | Accepted |
| REQ-005 | Web UI and API served from same port in production          | Must     | Accepted |
| REQ-006 | Config persists in localStorage with JSON export/import     | Must     | Accepted |
| REQ-007 | QR code gets ~half display height for scannability          | Must     | Accepted |
| REQ-008 | Live PNG preview before syncing to device                   | Must     | Accepted |
| REQ-009 | V1 ships B&W with 4-level grayscale, no color               | Must     | Accepted |
| REQ-010 | Enclosure ~14x11cm, fits GDEH0576T81 panel closely          | Must     | Accepted |
| REQ-011 | Display >=198 DPI, <=4mm visible bezel                      | Should   | Accepted |
| REQ-012 | Auto-rotate via two tilt switches, 4 orientations           | Must     | Accepted |
| REQ-013 | Sensor + presence data stays on-device, never sent to cloud | Must     | Accepted |

---

## 5. Scenarios

### Morning Glance at Kitchen Counter

**User class:** Daily Glancer
**Setting:** Kitchen counter near window, 7:15 AM, making coffee

Sam's InfoBento is standing on the kitchen counter near the window, its solar panel catching the morning light. The crisp 5.76" B&W eInk display shows a multi-box dashboard: weather (62F, partly cloudy), a countdown (14 days to vacation), today's date, a motivational quote, and a CO2 status box. Sam grabs a jacket based on the weather and notices the CO2 box is high enough to open a window. The display refreshed on schedule at 6 AM via Wi-Fi.

**Preconditions:** Device completed captive-portal Wi-Fi setup; config has weather, countdown, date, and quote boxes; device refreshed on schedule.

**Postcondition:** User has ambient awareness of weather, date, and upcoming event without touching any device.

### First-Time Web Configuration

**User classes:** Daily Glancer, Desk Decorator
**Setting:** Home office, laptop open, just unboxed the device

Alex opens infobento.com. The web UI shows a live 5.76" eInk preview on top with the editor below. They add Weather (type Portland -- geocoded via Nominatim), add Countdown (anniversary date), add a Date box, and a Quote box. The live 2-bit grayscale preview updates after each change. They click Export Config and save the JSON. Later they'll upload it during the device's captive-portal Wi-Fi setup.

### Gifting a Pre-Configured Device

**User class:** Gift Giver
**Setting:** Living room, wrapping gifts

Jordan buys an InfoBento for their friend who loves hiking. They configure 3 boxes: weather for the friend's city, a countdown to their next planned hike, and a QR code linking to their shared trail playlist. Jordan exports the config as JSON and includes a card with setup instructions. The friend opens the gift, connects to the device's captive portal, enters their Wi-Fi password, and the display shows Jordan's curated layout within a minute.

---

## 6. Wireframes

### Device Display

Single B&W eInk panel (Good Display GDEH0576T81, 5.76", 920×680, 198 DPI), enclosure ~14x11cm (fits the panel closely with a thin bezel). Tilt switches detect orientation -- layout auto-rotates.

**Elements:**

- Up to 10 boxes (MAX_BOXES=10) filling the panel area (dynamic based on font size)
- Inter TTF hero font for primary data, body font for labels
- SDF-antialiased rounded box borders on grey background
- Configurable corner radius (0-10) and padding (0-10)
- 4-level grayscale: anti-aliased fonts, grey labels for hierarchy
- Multi-column layouts via horizontal splits
- High-priority box / full-screen alert takeover for presence-aware escalations
- Auto-rotate based on tilt switch orientation

### Web Configuration Editor

Single-column layout: preview on top, editor below. Vanilla JS with reactive state, no framework.

**Elements:**

- Live 2-bit grayscale 5.76" eInk preview (server-rendered PNG, portrait + landscape)
- Box list with up/down reordering, remove button, inline-editable labels
- Add Box dropdown with type picker (18 types available)
- Per-box config forms (location for weather, date for countdown, URL for QR, etc.)
- Consent dialog (Privacy + Terms) on first load
- Font size, corner radius, and padding slider controls
- JSON import/export via Menu dropdown
- Browser geolocation on first load for auto-detected weather
- Debounced auto-fetch (500ms) on city input

---

## 7. Config Delivery

```
User                          Cloud                        Device
  |                              |                            |
  |-- configure on web --------->|                            |
  |                              |                            |
  |   [first time]               |                            |
  |                              |<--- captive portal --------|
  |                              |     (Wi-Fi + config JSON)  |
  |                              |                            |
  |   [updates]                  |                            |
  |-- push config to cloud ----->|                            |
  |                              |<--- poll /api/config/ID ---|
  |                              |---- framebuffer binary --->|
  |                              |                            |
  |                              |     [device caches last    |
  |                              |      framebuffer in flash  |
  |                              |      for offline display]  |
```

---

## 8. Rendering Pipeline

```
BentoConfig (JSON)
    |
    v
Zod validation
    |
    v
Layout engine (vertical stack + horizontal splits)
  - Configurable padding (0-10)
  - Content-aware height allocation
  - QR boxes get ~50% display height
    |
    v
Box renderers (18 types)
  - Inter TTF via opentype.js
  - Hero (bold) + body (regular) weights
  - 3-tier contrast: hero (dark grey), body (black), metadata (light grey)
    |
    v
Draw primitives
  - SDF-antialiased rounded rectangle borders
  - Configurable corner radius (0-10)
  - Grey background (GRAY_LIGHT) with white box interiors
    |
    v
2-bit grayscale framebuffer (156,400 bytes, 920×680)
    |
    v
PNG export (4-level grayscale mapping)
```

---

## 9. Findings and Decisions

### Type System Fix (Fixed)

Original BentoBox interface allowed type/config mismatches (`{ type: weather, config: { type: text } }`) without type errors. Fixed with discriminated union pattern -- each box type gets its own interface pairing type with config.

### Display Resolution (Resolved)

Display dimensions went through multiple iterations: 240x200 (placeholder) -> 128x296 (panel-native portrait) -> 240x200 (landscape after rotation) -> 920x680 (GDEH0576T81, locked v0.7.0) -> 7.5" 800×480 AQ-monitor pivot -> Waveshare 2.13" Rev 2.1, 250×122, black/white (Round 17 compact dashboard pivot, since superseded). **Round 18 restores the canonical Good Display GDEH0576T81, 5.76", 920×680, 198 DPI, SSD2677 driver, 2-bit grayscale (156,400-byte framebuffer)** — matching the codebase and `CLAUDE.md`, which never moved off this panel.

### eInk Design Research (Addressed)

Research across Tidbyt, Watchy, TRMNL, thermal printer art, and eInk phone accessories yielded key patterns:

1. One dominant element -- a single large hero element taking 40-50% of height
2. Two font sizes max -- large hero + small data, no medium
3. Whitespace beats borders -- generous padding between sections
4. Receipt-style layout -- label left-aligned, value right-aligned
5. 3-4 data items max per frame
6. Static > interactive -- single-purpose static frames work best
7. No touch required -- treat the display as output-only

### Pivot History

- **Round 5 (Apr 21):** MagSafe clamshell with dual displays
- **Round 10 (Apr 22):** Counter-only, single display, Wi-Fi direct
- **Round 11 (Apr 23):** B&W (color deferred to v2), 2-bit grayscale, bento-box form factor
- **Round 12 (Apr 24):** Panel locked (GDEH0576T81), enclosure shrunk to ~14x11cm, 17 box types, SDF borders
- **Round 14/15/16 (Apr 29):** AQ-monitor pivot, 7.5" screen, core AQ + presence bundle
- **Round 17 (May 7):** Tiny Bento Dashboard, Waveshare 2.13" Rev 2.1, mini-grid UI, ESP32 over 3-/4-line SPI, Core AQ + Presence retained _(display + product-shape superseded by Round 18)_
- **Round 18 (Jun 6):** Restored Good Display GDEH0576T81 5.76" / 920×680 / SSD2677 / 2-bit grayscale and the multi-box bento dashboard (MAX_BOXES=10, alert takeover); Core AQ + Presence retained

---

## 10. Open Items

| Item                                             | Status        | Blocking               |
| ------------------------------------------------ | ------------- | ---------------------- |
| Hardware dev kit validation (#57)                | Pending order | Grey rendering quality |
| Grey fallback -- Floyd-Steinberg dithering (#56) | Deferred      | Dev kit results        |
| Wire 5 new boxes into web UI (#53)               | Open          | Not blocking           |
| Content-aware layout for all types (#54)         | Open          | Not blocking           |
| Price validation at volume                       | Needs quotes  | Kickstarter pricing    |
| SCAD enclosure model (#50)                       | Open          | Prototype photography  |
| Captive-portal firmware (#39)                    | Open          | Device functionality   |
| Tilt switch hardware (#48)                       | Open          | Auto-rotate            |
| Presence sensor + privacy switch integration     | Open          | Core AQ + Presence     |

---

_InfoBento -- A bento dashboard that can sense the room._
_Phase: Campaign (Round 18 — 5.76" multi-box dashboard, Core AQ + Presence) | Version: v0.22.0 | June 2026_
