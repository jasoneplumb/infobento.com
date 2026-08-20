---
title: 'InfoBento Product Brief'
subtitle: 'See what matters. Skip the spiral.'
date: 'June 2026'
---

# InfoBento Product Brief

**See what matters. Skip the spiral.**

A solar-powered eInk bento dashboard that sits on your counter, desk, or shelf. Weather, a countdown, a quote, air-quality status — visible at a glance from across the room, in crisp eInk. Built around a Good Display GDEH0576T81 5.76" panel (920×680, 198 DPI) driven by an ESP32-class controller. No cables, no app, no plugin marketplace.

---

## Product Overview

InfoBento is a calm surface for the room. The information you check most often — whether it's going to rain, air-quality status from cloud data, days until something you're looking forward to — sits there in sharp eInk, visible at a glance from across the room. The display is a multi-box bento dashboard (up to 10 boxes, multi-column, with big glanceable numbers). Configure once on a web page; it sips light from the window and refreshes on its own.

Tidbyt and TRMNL are the ambient-display references. Against Tidbyt ($189), the contrast is the display itself: calm eInk rather than a glowing LED matrix. Against TRMNL ($139), also eInk and also battery-powered, the contrast is that InfoBento harvests its own power from window light instead of asking for a recharge every few months — on a smaller panel, at a lower price.

**Target price:** $109 early bird (first 500) / $129 standard / $239 gift pair — $119.50 per unit (Kickstarter), shipping at cost
**Distribution:** Kickstarter campaign

---

## Hardware Specifications

| Spec               | Value                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Display**        | Good Display GDEH0576T81 panel, ≈$24                                                          |
| **Size**           | 5.76" diagonal                                                                                |
| **Resolution**     | 920 × 680 pixels                                                                              |
| **DPI**            | 198                                                                                           |
| **Display tech**   | eInk (electrophoretic)                                                                        |
| **Driver IC**      | SSD2677                                                                                       |
| **Active area**    | 117.7 × 87.0 mm                                                                               |
| **Module size**    | 125.4 × 99.5 × 0.9 mm                                                                         |
| **Refresh time**   | 0.75s full / 0.3s partial; ≈1–2 refreshes/day                                                 |
| **MCU**            | ESP32-C3-MINI-1, ≈$2.80, Wi-Fi + BLE (BLE reserved for a possible v2 bridge)                  |
| **Battery**        | ≈100 mAh LiPo (≈$2); covers display + Wi-Fi only (no always-on sensors)                       |
| **Solar**          | ≈70×100 mm amorphous-Si (≈$3) + AEM10941 harvester (≈$4.40, upper back)                       |
| **Charging**       | USB-C, ≈$2                                                                                    |
| **PCB + passives** | ≈$3                                                                                           |
| **Enclosure**      | ≈14 × 11 cm white monolithic housing (≈$5) sized to fit GDEH0576T81 closely; thin bezel ≤4 mm |
| **Orientation**    | 2× ball-in-tube tilt switches (≈$0.20 total) drive orientation auto-rotate                    |
| **Stand**          | Body-as-stand; fold-out kickstand angles it ≈12–15° if needed                                 |
| **Connectivity**   | Wi-Fi direct, captive portal setup                                                            |

**Total device BOM ≈ $46.40 at Kickstarter volume (qty ≈1k):** GDEH0576T81 panel ≈$24 (dominates), ESP32-C3-MINI-1 ≈$2.80, ≈100 mAh LiPo ≈$2, solar panel ≈$3, AEM10941 harvester ≈$4.40, USB-C charge ≈$2, PCB + passives ≈$3, housing ≈$5, 2× tilt switches ≈$0.20.

Priced against distributor listings on 2026-08-19: the panel is $26.82 at single-unit retail from Good Display (list $29.80), with wholesale listings at $23–26, so ≈$24 is a reasonable qty-1k figure; ESP32-C3-MINI-1-N4 is $2.79 at LCSC and $3.26 at DigiKey; the AEM10941 is ≈€4. The panel, MCU, and harvester are now grounded in real listings; LiPo, solar cell, USB-C, PCB, housing, and switches remain estimates. **Still pending a manufacturer quote at volume** — the panel is the line that matters, since it is over half the BOM.

---

## Form Factor

```
+-----------------------+
|                       |
|   eInk panel          |   Front: display nearly fills the face
|   920 x 680           |          minimal bezel (<=4mm)
|   198 DPI             |
|                       |
+-----------------------+
       ^                    Back-upper: solar panel (≈70x100mm)
       | ≈12-15 deg tilt    Back-lower: ESP32-C3 + LiPo + USB-C
       | body-as-stand
```

- Monolithic white housing, no hinge; fold-out kickstand to angle it
- Fold-out kickstand angles the display ≈12-15 deg toward a standing viewer
- Designed to survive a 4-foot drop (bumper layer, radiused corners, recessed display)
- Solar panel on the upper back
- USB-C charging port on bottom edge; recessed pinhole reset on back for recovery only (press 5s with paperclip)

---

## Software Architecture

```
+--------------------+   Wi-Fi      +--------------+
|       Device       |<------------>|  Cloud API   |
|   eInk             |              |  (Hono +     |
|   ESP32-C3         |              |  SQLite;     |
|                    |              |  renders)    |
+--------------------+              +--------------+
                                           ^
                                           |
                                     +-----+------+
                                     |  Web UI     |
                                     |  (config)   |
                                     +------------+
```

**Pure function API:** Config JSON in, framebuffer binary out — on the render path. ⚠️ No longer true API-wide: since epic #77 accounts, device pairings, and per-device config live in SQLite, and claiming a device requires a passkey or Google/Apple sign-in (see the note under "Pure Function Architecture" below).

**On-device mapping:** After the cloud returns the framebuffer, the firmware maps it to the 920×680 panel and applies orientation from the tilt switches.

**Config delivery:**

1. First-time: captive portal (device broadcasts `InfoBento-XXXX` SSID, user enters Wi-Fi credentials + the Device ID from the sticker)
2. Ongoing: device polls `infobento.com/api/device/{device-id}/frames` for a server-rendered frame
3. Wi-Fi credentials and device id stored in ESP32 NVS; config held server-side; no framebuffer cache needed (eInk holds the last image unpowered)

---

## Rendering Pipeline

| Stage        | Detail                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Input**    | BentoConfig (Zod-validated JSON)                                                                 |
| **Layout**   | Vertical stack + horizontal splits, configurable padding (0-10), content-aware height allocation |
| **Font**     | Inter TTF via opentype.js, configurable 8-42px body, hero = body x 2.6                           |
| **Borders**  | SDF-antialiased rounded rectangles, configurable corner radius (0-10)                            |
| **Contrast** | 3-tier: hero text (dark grey), important body (black), metadata (light grey)                     |
| **Output**   | eInk framebuffer (packed 2-bit, 4 levels per pixel; 156,400 bytes for 920x680)                   |
| **Export**   | PNG with 4-level grayscale mapping                                                               |

---

## Box Types (18 total)

| Category          | Types                                                           | Data Source                               |
| ----------------- | --------------------------------------------------------------- | ----------------------------------------- |
| **Weather**       | Current weather, 8-hour forecast, 8-day forecast                | Open-Meteo (free, no key)                 |
| **Environment**   | Sunrise/sunset, air quality (AQI), UV index, pollen, moon phase | Open-Meteo cloud data + local computation |
| **Personal**      | Countdown, year progress, date                                  | Local computation                         |
| **Content**       | Quote, text                                                     | quotable mirror (free) / user input       |
| **Utility**       | QR code                                                         | User input                                |
| **Data**          | Stocks                                                          | Yahoo Finance (free)                      |
| **Entertainment** | Horoscope, on this day                                          | api-ninjas / Wikipedia                    |

The AQI, UV, and pollen boxes draw Open-Meteo cloud data — cloud data boxes like weather, not local sensor readings. Pollen is the one box with a regional limit: the upstream serves it for Europe during pollen season, and the box shows "No data" elsewhere rather than a misleading zero. All box types work without accounts, API keys, or subscriptions. The 5.76" panel hosts a multi-box bento dashboard (up to 10 boxes, multi-column) with big glanceable numbers. Quote and horoscope responses fall back to a bundled local set on upstream failure (≈50KB built-in).

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
- No account required to build a layout (an account is required to claim a device)
- Deployed at infobento.com

---

## Power Budget

| Component                   | Active | Sleep    | Duty                       |
| --------------------------- | ------ | -------- | -------------------------- |
| eInk full refresh           | ≈25 mA | 0 mA     | ≈0.75s full, ≈0.3s partial |
| Wi-Fi connect + frame fetch | ≈70 mA | ≈10 µA   | ≈10–20s, per refresh       |
| MCU active (during refresh) | ≈5 mA  | ≈5–10 µA | ≈15s, per refresh          |
| Tilt switches               | 0      | 0        | passive (orientation only) |

**Battery sizing:** ≈100 mAh LiPo plus solar harvest (5–15 mAh/day) easily covers the ≈1–2 refreshes/day display budget. With no always-on sensors, the only meaningful draw is the ESP32 radio during a refresh, which the panel sleeps between.

---

## User Classes

**Desk Decorator (primary):** Values aesthetic, minimal desk accessories. Wants a bento-box-sized eInk display showing a quote, countdown, weather, or QR code — standing on its own, solar-powered.

**Gift Giver / Daily Glancer (secondary):** Wants a thoughtful, personalized tech gift that works immediately, or ambient weather, schedule, and quotes visible without picking up a phone. Pre-configures via web UI.

---

## Competitive Positioning

|                | Tidbyt / TRMNL                                                   | InfoBento                                              |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| **Display**    | LED matrix / e-paper                                             | Good Display GDEH0576T81, 5.76" eInk, 920×680, 198 DPI |
| **MCU**        | ESP32 / ESP8266 / RP2040 class                                   | ESP32-C3 controller                                    |
| **Power**      | Mains (Tidbyt) / 1800 mAh battery, recharge every 3–6 mo (TRMNL) | Solar-harvesting; no scheduled recharge                |
| **Plugin/box** | DIY scripts or app marketplace                                   | 18-box multi-box bento dashboard, up to 10 boxes       |
| **Account**    | App + account                                                    | Web page, no app; passkey/OAuth sign-in to claim       |
| **Price**      | $189 Tidbyt Gen 2 / $139 TRMNL OG                                | $109–129 (Kickstarter)                                 |

InfoBento is a calmer, solar take on the ambient-display category: no wall cable, no app, no plugin marketplace — just a glanceable 5.76" eInk bento dashboard that refreshes itself on window light. Every tier undercuts the table on a per-unit basis — $109 early bird, $129 standard, and $119.50 each in the gift pair, against TRMNL's $139 as the closest comparable — though note InfoBento's panel is the smaller of the two (5.76" vs 7.5"), which is the trade a buyer is making.

Solar is the durable differentiator, and it is narrower than it first appears: TRMNL is battery-powered and runs 3–6 months per charge, so the honest claim is _never recharge_ versus _recharge twice a year_, not _cable-free_ versus _tethered_. Worth noting the closest competitor also has no subscription, so "no subscription" is table stakes here rather than a differentiator.

---

## Key Design Principles

1. **Multi-Box Bento Dashboard** — The 5.76" panel hosts a multi-box dashboard (up to 10 boxes, multi-column) with big glanceable numbers.
2. **Zero Device Interaction** — No buttons, no taps, no gestures. The only control is a recessed pinhole reset for recovery. Configure once at the web editor; the device just shows what matters.
3. **Pure Function Architecture** — Rendering is a pure function: same config in, same frame out (`POST /api/render`). ⚠️ Superseded in part by epic #77 — the API as a whole is no longer stateless; accounts, device pairings, and per-device config live in SQLite, and the device-facing path renders from stored config given only a device id.
4. **Free by Default** — All 18 dashboard box types work without accounts or API keys.
5. **Visual Restraint** — Four shades used with intention. Hero data, body text, and metadata each earn their contrast level.
6. **Web-Only Configuration** — Browser is the only config surface. No companion app.
7. **Solar-Powered Counter Display** — Monolithic white body, no hinge. Body stands on its own, with a fold-out kickstand to angle it.

---

## Open Items

- **Hardware validation** — Dev kit (ESP32-C3 + GDEH0576T81) on order. Validates grey rendering, refresh speed, viewing angle.
- **Grey fallback** — If 2-bit grey looks bad on hardware, Floyd-Steinberg dithering to 1-bit as fallback (#56).
- **Orientation auto-rotate** — Validate 2× ball-in-tube tilt switches drive reliable landscape/portrait detection.
- **Price validation:** the ≈$46.40 BOM is grounded in distributor listings for the panel, MCU, and harvester, but no volume quote has been obtained. It is the input the $109/$129 pricing depends on — if the panel quotes above ≈$32, revisit the tiers rather than absorbing it.
- **Certification + tooling NRE** — FCC/CE for a Wi-Fi device, UN38.3 for the lithium cell, and injection-mold tooling are unbudgeted. These are recovered from per-unit margin, which is why pricing at or near BOM does not work at any volume.
- **Firmware:** Captive portal provisioning (#39), Wi-Fi connect, config poll, framebuffer write, deep sleep cycle.
- **Enclosure:** SCAD model (#50) for ≈14×11 cm housing, ≤4 mm bezel, solar cavity, fold-out kickstand, pinhole reset.
- **Founder bio** — locked 2026-08-19. Career detail sourced from the founder's own resume; origin section built on minimal / simple / seamless.
- **Content-aware layout:** Height allocation for all 18 box types — shipped in v0.13.0 via `computeMinHeight` per renderer.

---

## Monorepo Structure

```
infobento.com/
  packages/core/      Types, layout engine, validation (Zod)
  packages/data/      Box-data providers (weather, quote, …) + cache
  packages/renderer/  eInk framebuffer generation
  packages/api/       Hono server (render API, auth/pairing, static files)
  packages/web/       Vite web editor (vanilla TS, no framework)
```

**Current version:** v0.35.1
**Tests:** 53 test files across `packages/*/src/**/*.test.ts`
**Quality gate:** `npm run build && npm test && npm run lint && npm run format:check`

---

_InfoBento — See what matters. Skip the spiral._
