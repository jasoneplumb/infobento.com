---
title: 'InfoBento Design Brief'
subtitle: 'UX model, requirements, and design decisions'
date: 'April 2026'
---

# InfoBento Design Brief

_See what matters. Skip the spiral._

**Domain:** Consumer electronics
**Phase:** Campaign (pre-Kickstarter)
**Version:** v0.9.0

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

Person who values aesthetic, minimal desk or counter accessories and wants a bento-box-sized B&W eInk display that shows a rotating quote, countdown to vacation, or personal QR code -- standing on its own, the body is the stand.

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

### Zero Device Interaction

> The InfoBento itself requires no interaction -- no buttons, no app to open, no charging ritual. You configure it once in a browser; after that InfoBento is just there.

InfoBento has no user-facing controls. It connects to Wi-Fi and refreshes on schedule. It charges via solar passively. The user's only interaction is glancing at it.

| Do                                             | Don't                             |
| ---------------------------------------------- | --------------------------------- |
| Glance at counter display from across the room | Require button press to refresh   |
| Solar charging near a window without cables    | Dedicated companion app           |
| Captive-portal first-time setup, no app        | Manual charging schedule or cable |

### Pure Function Architecture

> The API must be stateless -- same config in, same frame buffer out, every time.

No server-side state, no user accounts, no databases. Config lives on the client. Device caches last framebuffer in flash for offline resilience.

### Grayscale Elegance

> Four shades -- black, dark gray, light gray, white -- used with intention. Every tone earns its place.

The constraint is tight enough to feel intentional: four shades, not a gradient. Think newspaper print, not a photograph.

| Level      | Use                                                  |
| ---------- | ---------------------------------------------------- |
| Black      | Important body text (conditions, entries, names)     |
| Dark gray  | Hero/display text (large, doesn't need max contrast) |
| Light gray | Supporting metadata (H/L, author, streaks)           |
| White      | Box interior background                              |

### Free by Default

> All box types must work without accounts, API keys, or subscriptions.

All 17 box types use free data sources or local computation. Weather, forecast, sunrise/sunset, and air quality use Open-Meteo. Quotes use ZenQuotes. Everything else is pure local computation.

### Web-Only Configuration

> InfoBento is configured exclusively from a web browser. No native phone app required.

The web editor at infobento.com is the only configuration surface. No companion iOS or Android app for v1. This removes ~6+ months of engineering scope and the iOS background BLE risk.

### Solar-Powered Counter Display

> Monolithic body, no hinge, no kickstand. Body is the stand.

Enclosure ~14x11cm, white housing, minimal bezel. Solar panel on upper back. Tilt switches detect orientation for auto-rotate. Designed to survive a 4-foot drop.

---

## 4. Requirements

| ID      | Statement                                               | Priority | Status   |
| ------- | ------------------------------------------------------- | -------- | -------- |
| REQ-001 | User can configure 3-6 bento boxes via web interface    | Must     | Accepted |
| REQ-002 | Device syncs via Wi-Fi direct, no companion phone app   | Must     | Accepted |
| REQ-003 | Display refreshes 1-2x/day on solar power alone         | Must     | Accepted |
| REQ-004 | 17 box types without user accounts                      | Must     | Accepted |
| REQ-005 | Web UI and API served from same port in production      | Must     | Accepted |
| REQ-006 | Config persists in localStorage with JSON export/import | Must     | Accepted |
| REQ-007 | QR code gets ~half display height for scannability      | Must     | Accepted |
| REQ-008 | Live PNG preview before syncing to device               | Must     | Accepted |
| REQ-009 | V1 ships B&W with 4-level grayscale, no color           | Must     | Accepted |
| REQ-010 | Enclosure ~14x11cm, fits GDEH0576T81 panel closely      | Must     | Accepted |
| REQ-011 | Display >=198 DPI, <=3mm visible bezel                  | Should   | Accepted |
| REQ-012 | Auto-rotate via two tilt switches, 4 orientations       | Must     | Accepted |

---

## 5. Scenarios

### Morning Glance at Kitchen Counter

**User class:** Daily Glancer
**Setting:** Kitchen counter near window, 7:15 AM, making coffee

Sam's InfoBento is standing on the kitchen counter near the window, its solar panel catching the morning light. The crisp B&W eInk display shows weather (62F, partly cloudy), a countdown (14 days to vacation), today's date, and a motivational quote. Sam grabs a jacket based on the weather. Total interaction with the device: zero. The display refreshed on schedule at 6 AM via Wi-Fi.

**Preconditions:** Device completed captive-portal Wi-Fi setup; config has weather, countdown, date, and quote boxes; device refreshed on schedule.

**Postcondition:** User has ambient awareness of weather, date, and upcoming event without touching any device.

### First-Time Web Configuration

**User classes:** Daily Glancer, Desk Decorator
**Setting:** Home office, laptop open, just unboxed the device

Alex opens infobento.com. The web UI shows a live eInk preview on top with the editor below. They add Weather (type Portland -- geocoded via Nominatim), add Countdown (anniversary date), add a Date box, and a Quote box. The live 2-bit grayscale preview updates after each change. They click Export Config and save the JSON. Later they'll upload it during the device's captive-portal Wi-Fi setup.

### Gifting a Pre-Configured Device

**User class:** Gift Giver
**Setting:** Living room, wrapping gifts

Jordan buys an InfoBento for their friend who loves hiking. They configure 3 boxes: weather for the friend's city, a countdown to their next planned hike, and a QR code linking to their shared trail playlist. Jordan exports the config as JSON and includes a card with setup instructions. The friend opens the gift, connects to the device's captive portal, enters their Wi-Fi password, and the display shows Jordan's curated layout within a minute.

---

## 6. Wireframes

### Device Display

Single B&W eInk panel, enclosure ~14x11cm (fits GDEH0576T81 panel closely with minimal bezel). 198 DPI. Tilt switches detect orientation -- layout auto-rotates.

**Elements:**

- 3-10 sections filling the panel area (dynamic based on font size)
- Inter TTF hero font for primary data, body font for labels
- SDF-antialiased rounded box borders on grey background
- Configurable corner radius (0-10) and padding (0-10)
- 4-level grayscale: anti-aliased fonts, grey labels for hierarchy
- Multi-column layouts via horizontal splits
- Auto-rotate based on tilt switch orientation

### Web Configuration Editor

Single-column layout: preview on top, editor below. Vanilla JS with reactive state, no framework.

**Elements:**

- Live 2-bit grayscale eInk preview (server-rendered PNG, portrait + landscape)
- Box list with up/down reordering, remove button, inline-editable labels
- Add Box dropdown with type picker (17 types available)
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
Box renderers (17 types)
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
2-bit grayscale framebuffer (156,400 bytes)
    |
    v
PNG export (4-level grayscale mapping)
```

---

## 9. Findings and Decisions

### Type System Fix (Fixed)

Original BentoBox interface allowed type/config mismatches (`{ type: weather, config: { type: text } }`) without type errors. Fixed with discriminated union pattern -- each box type gets its own interface pairing type with config.

### Display Resolution (Resolved)

Display dimensions went through multiple iterations: 240x200 (placeholder) -> 128x296 (panel-native portrait) -> 240x200 (landscape after rotation) -> 920x680 (GDEH0576T81, locked v0.7.0). Panel sourcing resolved: Good Display GDEH0576T81, 5.76", 920x680, 198 DPI.

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

---

_InfoBento -- See what matters. Skip the spiral._
_Phase: Campaign | Version: v0.9.0 | April 2026_
