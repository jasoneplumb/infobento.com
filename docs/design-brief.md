---
title: 'InfoBento Design Brief'
subtitle: 'UX model, requirements, and design decisions'
date: 'June 2026'
---

# InfoBento Design Brief

_A calm bento dashboard for counters, desks, and shelves._

**Domain:** Consumer electronics
**Phase:** Campaign (pre-Kickstarter)
**Version:** v0.22.0

---

## Product Overview

InfoBento is a small, solar-powered eInk bento dashboard for counters, desks, and shelves. It is glance-first: a calm multi-box dashboard that configures once and refreshes on schedule.

- **Positioning:** A lean, calm bento dashboard for counters, desks, and shelves.
- **UI model:** Multi-box bento dashboard — up to 10 boxes (`MAX_BOXES=10`), multi-column.
- **Display:** Good Display **GDEH0576T81**, 5.76" eInk, **920×680 px**, **198 DPI**, **SSD2677** driver IC, eInk. Framebuffer **156,400 bytes** (packed 2-bit, 4 levels per pixel). Refresh 1–2×/day, 0.75 s full / 0.3 s partial. Active area 117.7×87.0 mm; module 125.4×99.5×0.9 mm.
- **Enclosure:** white monolithic housing ~14×11 cm sized to fit the GDEH0576T81 closely; thin bezel ≤4 mm; body-as-stand, with a fold-out kickstand to angle it ~12–15° if needed.
- **MCU:** ESP32-C3 (Wi-Fi + BLE; BLE reserved for a possible v2 bridge). Captive-portal setup; no companion app v1; config via the infobento.com web editor.
- **Power:** ~70×100 mm solar panel on the upper back + ~100 mAh LiPo + AEM10941 solar harvester; ~1–2 refreshes/day.
- **Orientation:** two ball-in-tube tilt switches for orientation auto-rotate.
- **Interaction:** zero device interaction — no buttons (a recessed pinhole reset exists for recovery only).

Configure once at the infobento.com web editor; the display then runs quietly on solar power, refreshing on schedule.

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

Person who values aesthetic, minimal desk or counter accessories and wants a bento-box-sized eInk display that shows a multi-box dashboard of useful status boxes -- standing on its own, the body is the stand.

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

> InfoBento has no buttons. The entire loop is configure once, glance often.

There are no buttons or interactive controls on the device — only a recessed pinhole reset for recovery. The display charges via solar passively and refreshes on schedule; everything else happens in the web editor.

| Do                                             | Don't                             |
| ---------------------------------------------- | --------------------------------- |
| Glance at counter display from across the room | Require a button press to refresh |
| Configure once in the web editor               | Dedicated companion app           |
| Solar charging near a window without cables    | Manual charging schedule or cable |
| Captive-portal first-time setup, no app        | Notification stream or buzzer     |

### Pure Function Architecture

> The API must be stateless -- same config in, same frame buffer out, every time.

No server-side state, no user accounts, no databases. Config lives on the client. Device caches last framebuffer in flash for offline resilience.

### Visual Restraint

> A tight, intentional tonal palette used with discipline. Every tone earns its place.

The palette is deliberately restrained: a few intentional tones rather than a gradient, applied to express a clear visual hierarchy. Think newspaper print, not a photograph. Tone and contrast distinguish hero text, body text, and metadata — hero/display text reads large without needing maximum contrast, body text carries the most important content, and metadata sits quietly in support.

### Free by Default

> All box types must work without accounts, API keys, or subscriptions.

All box types use free data sources or local computation. Weather, forecast, sunrise/sunset, and air quality (AQI) use Open-Meteo cloud data. Quotes use ZenQuotes. Everything else is pure local computation.

### Web-Only Configuration

> InfoBento is configured exclusively from a web browser. No native phone app required.

The web editor at infobento.com is the only configuration surface. No companion iOS or Android app for v1. This removes ~6+ months of engineering scope and the iOS background BLE risk.

### Solar-Powered Counter Display

> A single monolithic body that stands on its own, with a fold-out kickstand to angle it if needed.

White monolithic enclosure ~14×11 cm sized to fit the GDEH0576T81 (5.76", 920×680) closely, with a thin bezel (≤4 mm) and a fold-out kickstand for ~12–15° tilt. Solar panel on the upper back, with the AEM10941 harvester topping up the ~100 mAh LiPo. Two ball-in-tube tilt switches drive orientation auto-rotate.

---

## 4. Requirements

| ID      | Statement                                                 | Priority |
| ------- | --------------------------------------------------------- | -------- |
| REQ-001 | User can configure 3-6 bento boxes via web interface      | Must     |
| REQ-002 | Device syncs via Wi-Fi direct, no companion phone app     | Must     |
| REQ-003 | Display refreshes 1-2x/day on solar power alone           | Must     |
| REQ-004 | 18 box types without user accounts, up to MAX_BOXES=10    | Must     |
| REQ-005 | Web UI and API served from same port in production        | Must     |
| REQ-006 | Config persists in localStorage with JSON export/import   | Must     |
| REQ-007 | QR code gets ~half display height for scannability        | Must     |
| REQ-008 | Live PNG preview before syncing to device                 | Must     |
| REQ-009 | V1 uses an eInk panel (display color capability TBD)      | Must     |
| REQ-010 | Enclosure ~14x11cm, fits GDEH0576T81 panel closely        | Must     |
| REQ-011 | Display >=198 DPI, <=4mm visible bezel                    | Should   |
| REQ-012 | Auto-rotate via two tilt switches, 4 orientations         | Must     |
| REQ-013 | Zero device interaction — no buttons (pinhole reset only) | Must     |

---

## 5. Scenarios

### Morning Glance at Kitchen Counter

**User class:** Daily Glancer
**Setting:** Kitchen counter near window, 7:15 AM, making coffee

Sam's InfoBento is standing on the kitchen counter near the window, its solar panel catching the morning light. The crisp 5.76" eInk display shows a multi-box dashboard: weather (62F, partly cloudy), a countdown (14 days to vacation), today's date, and a motivational quote. Sam grabs a jacket based on the weather and notes the vacation countdown. The display refreshed on schedule at 6 AM via Wi-Fi.

**Preconditions:** Device completed captive-portal Wi-Fi setup; config has weather, countdown, date, and quote boxes; device refreshed on schedule.

**Postcondition:** User has ambient awareness of weather, date, and upcoming event without touching any device.

### First-Time Web Configuration

**User classes:** Daily Glancer, Desk Decorator
**Setting:** Home office, laptop open, just unboxed the device

Alex opens infobento.com. The web UI shows a live 5.76" eInk preview on top with the editor below. They add Weather (type Portland -- geocoded via Nominatim), add Countdown (anniversary date), add a Date box, and a Quote box. The live preview updates after each change. They click Export Config and save the JSON. Later they'll upload it during the device's captive-portal Wi-Fi setup.

### Gifting a Pre-Configured Device

**User class:** Gift Giver
**Setting:** Living room, wrapping gifts

Jordan buys an InfoBento for their friend who loves hiking. They configure 3 boxes: weather for the friend's city, a countdown to their next planned hike, and a QR code linking to their shared trail playlist. Jordan exports the config as JSON and includes a card with setup instructions. The friend opens the gift, connects to the device's captive portal, enters their Wi-Fi password, and the display shows Jordan's curated layout within a minute.

---

## 6. Wireframes

### Device Display

Single eInk panel (Good Display GDEH0576T81, 5.76", 920×680, 198 DPI), enclosure ~14x11cm (fits the panel closely with a thin bezel). Tilt switches detect orientation -- layout auto-rotates.

**Elements:**

- Up to 10 boxes (MAX_BOXES=10) filling the panel area (dynamic based on font size)
- Inter TTF hero font for primary data, body font for labels
- SDF-antialiased rounded box borders on grey background
- Configurable corner radius (0-10) and padding (0-10)
- 4-level grayscale: anti-aliased fonts, grey labels for hierarchy
- Multi-column layouts via horizontal splits
- Auto-rotate based on tilt switch orientation

### Web Configuration Editor

Single-column layout: preview on top, editor below. Vanilla JS with reactive state, no framework.

**Elements:**

- Live 5.76" eInk preview (server-rendered PNG, portrait + landscape)
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
  |                              |<- poll /api/device/ID/frames -|
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
eInk framebuffer (156,400 bytes, 920×680)
    |
    v
PNG export (4-level grayscale mapping)
```

---

## 9. Design Decisions

### Type System

The `BentoBox` interface uses a discriminated union pattern -- each box type gets its own interface pairing type with config -- so type/config mismatches (`{ type: weather, config: { type: text } }`) are caught at compile time.

### eInk Design Research

Research across Tidbyt, Watchy, TRMNL, thermal printer art, and eInk phone accessories yielded key patterns that drive the rendering model:

1. One dominant element -- a single large hero element taking 40-50% of height
2. Two font sizes max -- large hero + small data, no medium
3. Whitespace beats borders -- generous padding between sections
4. Receipt-style layout -- label left-aligned, value right-aligned
5. 3-4 data items max per frame
6. Static > interactive -- single-purpose static frames work best
7. No touch required -- treat the display as output-only

---

## 10. Cost and Pricing

Total BOM is approximately **$45–50** at Kickstarter volume (qty ~1k), dominated by the 5.76" panel. Figures are estimates pending manufacturer quotes.

| Component                 | Est. cost |
| ------------------------- | --------- |
| GDEH0576T81 panel         | ~$30      |
| ESP32-C3                  | ~$2.50    |
| ~100 mAh LiPo             | ~$2       |
| Solar panel               | ~$3       |
| AEM10941 energy harvester | ~$3       |
| USB-C charge              | ~$2       |
| PCB + passives            | ~$3       |
| Housing                   | ~$5       |
| Tilt switches             | ~$0.20    |

**Price target:** $49–69 (Kickstarter).

---

## 11. Open Items

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

_InfoBento -- A calm bento dashboard for counters, desks, and shelves._
_Phase: Campaign | Version: v0.22.0 | June 2026_
