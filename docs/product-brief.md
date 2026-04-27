---
title: 'InfoBento Product Brief'
subtitle: 'See what matters. Skip the spiral.'
date: 'April 2026'
---

# InfoBento Product Brief

**See what matters. Skip the spiral.**

A solar-powered B&W eInk display that sits on your counter, desk, or shelf. Weather, a countdown, a quote — visible at a glance from across the room, in crisp black ink on paper-white. No cables, no account, no batteries to swap, no buttons to press.

---

## Product Overview

InfoBento is a small, calm surface for the room. The information you check most often — weather, the next thing on your calendar, days until something you're looking forward to — sits there in sharp B&W eInk, visible at a glance. Configure once on a web page; it sips light from the window and refreshes on its own.

**Target price:** $30-40 via Kickstarter (pending manufacturer quotes)
**Distribution:** Kickstarter campaign

---

## Hardware Specifications

| Spec               | Value                                          |
| ------------------ | ---------------------------------------------- |
| **Display**        | Good Display GDEH0576T81                       |
| **Size**           | 5.76" diagonal                                 |
| **Resolution**     | 920 x 680 pixels                               |
| **DPI**            | 198                                            |
| **Color depth**    | B&W with 2-bit grayscale (4 levels)            |
| **Driver IC**      | SSD2677                                        |
| **Active area**    | 117.7 x 87.0 mm                                |
| **Module size**    | 125.4 x 99.5 x 0.9 mm                          |
| **Refresh time**   | 0.75s full / 0.3s partial                      |
| **MCU**            | ESP32-C3 (Wi-Fi 4 + BLE 5)                     |
| **Battery**        | ~100 mAh LiPo                                  |
| **Solar**          | ~70x100 mm amorphous-Si + AEM10941 harvester   |
| **Enclosure**      | ~14 x 11 cm, white injection-molded plastic    |
| **Tilt detection** | Two ball-in-tube tilt switches, 4 orientations |
| **Connectivity**   | Wi-Fi direct, captive portal setup             |

---

## Form Factor

```
+-----------------------+
|                       |
|   B&W eInk panel      |   Front: display nearly fills the face
|   920 x 680           |          minimal bezel (<=3mm)
|   198 DPI             |
|                       |
+-----------------------+
       ^                    Back-upper: solar panel (~70x100mm)
       | ~12-15 deg tilt    Back-lower: ESP32-C3 + battery + tilt switches
       | body-as-stand
```

- Monolithic white housing, no hinge, no kickstand
- Body tilts ~12-15 deg so display angles toward standing viewer
- Designed to survive a 4-foot drop (bumper layer, radiused corners, recessed display)
- Pinhole reset on back for factory reset (press 5s with paperclip)

---

## Software Architecture

```
+----------------+    Wi-Fi     +--------------+
|     Device     |<------------>|  Cloud API   |
|  B&W eInk      |              |  (stateless) |
|  ESP32-C3      |              +--------------+
+----------------+                     ^
                                       |
                                 +-----+------+
                                 |  Web UI     |
                                 |  (config)   |
                                 +------------+
```

**Pure function API:** Config JSON in, framebuffer binary out. No server-side state, no user accounts.

**Server-side rendering:** Device sends config to cloud API, gets framebuffer back. Device caches last framebuffer in flash for offline resilience.

**Config delivery:**

1. First-time: captive portal (device broadcasts `InfoBento-XXXX` SSID, user uploads config JSON + Wi-Fi credentials)
2. Ongoing: device polls `infobento.com/api/config/{device-id}` for config updates
3. Config stored in ESP32 NVS; framebuffer cached in flash

---

## Rendering Pipeline

| Stage        | Detail                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Input**    | BentoConfig (Zod-validated JSON)                                                                 |
| **Layout**   | Vertical stack + horizontal splits, configurable padding (0-10), content-aware height allocation |
| **Font**     | Inter TTF via opentype.js, configurable 8-42px body, hero = body x 2.6                           |
| **Borders**  | SDF-antialiased rounded rectangles, configurable corner radius (0-10)                            |
| **Contrast** | 3-tier: hero text (dark grey), important body (black), metadata (light grey)                     |
| **Output**   | 2-bit grayscale framebuffer (156,400 bytes for 920x680)                                          |
| **Export**   | PNG with 4-level grayscale mapping                                                               |

---

## Box Types (17 total)

| Category        | Types                                            | Data Source                    |
| --------------- | ------------------------------------------------ | ------------------------------ |
| **Weather**     | Current weather, 8-hour forecast, 8-day forecast | Open-Meteo (free, no key)      |
| **Environment** | Sunrise/sunset, air quality, moon phase          | Open-Meteo + local computation |
| **Personal**    | Countdown, year progress, date                   | Local computation              |
| **Content**     | Quote, text                                      | ZenQuotes (free) / user input  |
| **Utility**     | QR code, tasks, calendar, habits                 | User input                     |
| **Data**        | Stocks, world clock                              | TBD / local computation        |

All box types work without accounts, API keys, or subscriptions.

---

## Web Editor

- Live preview (server-rendered PNG, landscape + portrait)
- Debounced auto-fetch for location-based boxes (500ms)
- Browser geolocation on first load (auto-detect user's city)
- Auto-fetch random quote on box add
- Configurable: font size (8-42px), corner radius (0-10), display padding (0-10)
- Show/hide box headers toggle
- Config persists in browser localStorage
- JSON import/export for portability
- No account required
- Deployed at infobento.com

---

## Power Budget

| Component                   | Active | Sleep    | Duration |
| --------------------------- | ------ | -------- | -------- |
| B&W eInk full refresh       | ~25 mA | 0 mA     | ~0.75s   |
| Wi-Fi connect + fetch frame | ~70 mA | ~10 uA   | ~10-20s  |
| MCU active (during refresh) | ~5 mA  | ~5-10 uA | ~15s     |

**Per refresh cycle:** ~15-20s active, ~0.8-1.2 mAh
**Daily budget (2 refreshes):** ~2-3 mAh
**Solar harvest:** 5-15 mAh/day (moderate indoor light through window)
**Margin:** 3-12 mAh/day surplus

---

## User Classes

**Desk Decorator (primary):** Values aesthetic, minimal desk accessories. Wants a bento-box-sized display showing a quote, countdown, or QR code — standing on its own, solar-powered.

**Daily Glancer (secondary):** Busy professional who wants ambient weather, schedule, and quotes visible without picking up a phone.

**Gift Giver:** Wants a thoughtful, personalized tech gift that works immediately. Pre-configures the device via web UI, includes a card with setup instructions.

---

## Competitive Positioning

|             | Tidbyt               | InfoBento                 |
| ----------- | -------------------- | ------------------------- |
| **Display** | 64x32 LED matrix     | 920x680 B&W eInk, 198 DPI |
| **Feel**    | Glowing, animated    | Paper-like, still         |
| **Power**   | Wall outlet required | Solar-powered, no cable   |
| **Setup**   | App + account        | Web page, no account      |
| **Price**   | $179                 | $30-40 target             |

**Tagline vs Tidbyt:** "Tidbyt glows. InfoBento reads."

---

## Key Design Principles

1. **Zero Device Interaction** — No buttons, no app, no charging ritual. Configure once, glance forever.
2. **Pure Function Architecture** — Stateless API. Same config in, same frame out. No server-side state.
3. **Free by Default** — All 17 box types work without accounts or API keys.
4. **Grayscale Elegance** — Four shades used with intention. Hero data, body text, and metadata each earn their contrast level.
5. **Web-Only Configuration** — Browser is the only config surface. No native app for v1.
6. **Solar-Powered Counter Display** — Monolithic body, no hinge, no kickstand. Body is the stand.

---

## Open Items

- **Hardware validation:** Dev kit (ESP32-C3 + GDEH0576T81) on order. Validates grey rendering, refresh speed, viewing angle.
- **Grey fallback:** If 2-bit grey looks bad on hardware, Floyd-Steinberg dithering to 1-bit as fallback (#56).
- **Price validation:** $30-40 target needs manufacturer quotes at Kickstarter volume.
- **Firmware:** Captive portal provisioning (#39), Wi-Fi connect, config poll, framebuffer write, deep sleep cycle.
- **Enclosure:** SCAD model (#50) for ~14x11cm housing, <=3mm bezel, tilt switch cavities, pinhole reset.
- **Content-aware layout:** Height allocation for all 17 box types, not just quotes (#54).

---

## Monorepo Structure

```
infobento.com/
  packages/core/      Types, layout engine, validation (Zod)
  packages/renderer/  2-bit grayscale framebuffer generation
  packages/api/       Hono server (stateless API + static files)
  packages/web/       Vite web editor (vanilla JS, no framework)
```

**Current version:** v0.9.0
**Tests:** 145 passing across 20 test files
**Quality gate:** `npm run build && npm test && npm run lint && npm run format:check`

---

_InfoBento — See what matters. Skip the spiral._
