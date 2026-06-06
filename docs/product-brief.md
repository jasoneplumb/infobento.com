---
title: 'InfoBento Product Brief'
subtitle: 'See what matters. Skip the spiral. Now it can sense the room.'
date: 'June 2026 (Round 18 revision, 2026-06-06)'
---

# InfoBento Product Brief

**See what matters. Skip the spiral. Now it can sense the room.**

A solar-powered B&W eInk bento dashboard that sits on your counter, desk, or shelf. Weather, a countdown, a quote, air-quality status, presence-aware alerts — visible at a glance from across the room, in crisp black ink on paper-white. Built around a Good Display GDEH0576T81 5.76" panel (920×680, 198 DPI) driven by an ESP32-class controller. No cables, no account, no plugin marketplace.

> **Round 18 (2026-06-06):** This revision supersedes Round 17's display + product-shape pivot. Round 17 explored a compact Waveshare 2.13" (250×122) "tiny dashboard / mini grid" panel; that direction is **superseded**. We restore the canonical 5.76" GDEH0576T81 multi-box bento dashboard (up to 10 boxes, multi-column, big glanceable numbers, full-screen alert takeover) and **retain** all of the Core AQ + Presence sensor, privacy, and interaction work that Round 17 added.

---

## Product Overview

InfoBento is a calm surface for the room with local room awareness. The information you check most often — weather, the next thing on your calendar, days until something you're looking forward to, air-quality status — sits there in sharp B&W eInk, visible at a glance from across the room. The display is a multi-box bento dashboard (up to 10 boxes, multi-column, with big glanceable numbers), and the highest-priority box can take over the full screen during alerts. CO2, particulates, VOCs, and presence detection support the dashboard with on-device context. Configure once on a web page; it sips light from the window and refreshes on its own.

Aranet4, AirGradient, Awair, and AirThings remain sensor-quality references; Tidbyt and TRMNL remain ambient-display references. InfoBento differs by combining a glanceable B&W eInk bento dashboard with on-device sensing and a no-account, solar-powered form factor.

**Target price:** $30-40 via Kickstarter, to be re-validated against the Core AQ + Presence BOM (pending manufacturer quotes)
**Distribution:** Kickstarter campaign

---

## Hardware Specifications (Round 18 revision)

| Spec                         | Value                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Display**                  | Good Display GDEH0576T81                                                                                                                                                                                       |
| **Size**                     | 5.76" diagonal                                                                                                                                                                                                 |
| **Resolution**               | 920 × 680 pixels                                                                                                                                                                                               |
| **DPI**                      | 198                                                                                                                                                                                                            |
| **Color depth**              | B&W with 2-bit grayscale (4 levels in software)                                                                                                                                                                |
| **Driver IC**                | SSD2677                                                                                                                                                                                                        |
| **Active area**              | 117.7 × 87.0 mm                                                                                                                                                                                                |
| **Module size**              | 125.4 × 99.5 × 0.9 mm                                                                                                                                                                                          |
| **Refresh time**             | 0.75s full / 0.3s partial; ~1–2 refreshes/day                                                                                                                                                                  |
| **MCU**                      | ESP32-class controller (ESP32-C3 target), Wi-Fi + BLE                                                                                                                                                          |
| **CO2**                      | Sensirion **SCD41** — NDIR, ~$13.50, ABC calibration (the chip Aranet4 uses)                                                                                                                                   |
| **Air quality**              | Bosch **BME688** — VOC/IAQ index + pressure + redundant T/RH, ~$5.20                                                                                                                                           |
| **Particulates**             | Sensirion **SEN54** — PM1/PM2.5/PM10, ~$25.00                                                                                                                                                                  |
| **Presence**                 | **HLK-LD2410C** mmWave radar (~$5.00, sees breathing micro-motion) + **AM312** PIR (~$0.80, cheap interrupt + radar power-gating) + hardware **privacy switch** on back (~$0.30, physically disconnects radar) |
| **Knock-detect**             | **LIS3DH** accelerometer, ~$1.20, double-tap-to-dismiss                                                                                                                                                        |
| **Button**                   | 1× front tactile, ~$0.50                                                                                                                                                                                       |
| **RGB LED**                  | 1× SK6812 dimmable behind frosted dot, ~$0.50, off by default; amber pulse on alert escalation                                                                                                                 |
| **Sensor + interaction BOM** | **~$56** added; sensors on shared I2C, PIR + LIS3DH + button on GPIO interrupts; eInk on SPI                                                                                                                   |
| **Battery**                  | ~100 mAh LiPo baseline; re-size against ESP32 radio + Core AQ + Presence sensor duty cycle                                                                                                                     |
| **Solar**                    | ~70×100 mm amorphous-Si + AEM10941 harvester (upper back)                                                                                                                                                      |
| **Charging**                 | USB-C                                                                                                                                                                                                          |
| **Enclosure**                | ~14 × 11 cm white monolithic housing sized to fit GDEH0576T81 closely; thin bezel ≤4 mm; sensor grille, PIR/radar keepout, privacy slider, button, and optional LED integrated into the layout                 |
| **Tilt detection**           | Body-as-stand ~12–15° tilt; LIS3DH covers rotation/orientation                                                                                                                                                 |
| **Connectivity**             | Wi-Fi direct, captive portal setup                                                                                                                                                                             |
| **Privacy**                  | Sensor data + presence data stays on-device by default; hardware privacy switch on the back; cloud never sees readings                                                                                         |

---

## Form Factor

```
+-----------------------+
|                       |
|   B&W eInk panel      |   Front: display nearly fills the face
|   920 x 680           |          minimal bezel (<=4mm)
|   198 DPI             |
|                       |
+-----------------------+
       ^                    Back-upper: solar panel (~70x100mm)
       | ~12-15 deg tilt    Back/side:  sensor grille + PIR/radar keepout
       | body-as-stand      Back-lower: ESP32 + LiPo + USB-C + button
```

- Monolithic white housing, no hinge, no kickstand
- Body tilts ~12-15 deg so display angles toward standing viewer
- Designed to survive a 4-foot drop (bumper layer, radiused corners, recessed display)
- Solar panel on the upper back; sensor grille covers SCD41/BME688/SEN54 inlets — designed to read as a brand mark, not a speaker grille
- USB-C charging port on bottom edge; pinhole reset on back for factory reset (press 5s with paperclip)

---

## Software Architecture

```
+--------------------+   Wi-Fi      +--------------+
|       Device       |<------------>|  Cloud API   |
|   B&W eInk         |  (no sensor  |  (stateless, |
|   ESP32-C3         |   data)      |  no sensor   |
|   + local sensors  |              |  data ever)  |
|   + local overlay  |              +--------------+
+--------------------+                     ^
                                           |
                                     +-----+------+
                                     |  Web UI     |
                                     |  (config)   |
                                     +------------+
```

**Pure function API:** Config JSON in, base framebuffer binary out. No server-side state, no user accounts. **The cloud renderer never sees sensor readings** — they stay on the device.

**On-device sensor overlay:** After the cloud returns the base framebuffer, the firmware maps it to the 920×680 panel and overlays sensor-aware boxes or full-screen alert states using local readings. This is the privacy commitment: sensor data never leaves the device.

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

## Box Types (18 total)

| Category          | Types                                            | Data Source                         |
| ----------------- | ------------------------------------------------ | ----------------------------------- |
| **Weather**       | Current weather, 8-hour forecast, 8-day forecast | Open-Meteo (free, no key)           |
| **Environment**   | Sunrise/sunset, air quality, moon phase          | Open-Meteo + local computation      |
| **Personal**      | Countdown, year progress, date                   | Local computation                   |
| **Content**       | Quote, text                                      | quotable mirror (free) / user input |
| **Utility**       | QR code, calendar, habits                        | User input                          |
| **Data**          | Stocks                                           | Yahoo Finance (free)                |
| **Entertainment** | Horoscope, joke, on this day                     | api-ninjas / JokeAPI / Wikipedia    |

All box types work without accounts, API keys, or subscriptions. The 5.76" panel hosts a multi-box bento dashboard (up to 10 boxes, multi-column) with big glanceable numbers; the highest-priority box can take over the full screen during alerts. Quote, joke, and horoscope responses fall back to a bundled local set on upstream failure (~50KB built-in).

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

## Power Budget (Round 18 revision)

| Component                     | Active             | Sleep              | Duty                                    |
| ----------------------------- | ------------------ | ------------------ | --------------------------------------- |
| B&W eInk full refresh         | ~25 mA             | 0 mA               | ~0.75s full, ~0.3s partial              |
| Wi-Fi connect + frame fetch   | ~70 mA             | ~10 µA             | ~10–20s, per refresh                    |
| MCU active (during refresh)   | ~5 mA              | ~5–10 µA           | ~15s, per refresh                       |
| SCD41 single-shot             | ~50 mA             | ~0.15 µA           | ~5s every 5 min                         |
| BME688 forced-mode            | ~12 mA             | <1 µA              | ~50ms every 5 min                       |
| SEN54 measurement (fan on)    | ~50 mA             | ~5 µA              | 30s every 15 min                        |
| HLK-LD2410C (PIR-gated burst) | ~75 mA             | 0 mA (power-gated) | ~285 µA average                         |
| AM312 PIR                     | ~12 µA             | ~12 µA             | always-on                               |
| LIS3DH double-tap-detect      | ~1.8 µA            | ~1.8 µA            | always-on (interrupt wake)              |
| Front button                  | 0                  | 0                  | event-driven                            |
| RGB LED (off by default)      | ~5 mA when pulsing | ~1 µA              | event-driven (~5s amber pulse on alert) |

**Battery sizing:** ~100 mAh LiPo baseline plus solar harvest (5–15 mAh/day) covers the ~1–2 refreshes/day display budget; the ESP32 radio and Core AQ + Presence sensor duty cycle now dominate the budget and drive final battery + solar sizing.

---

## User Classes

**Desk Decorator (primary):** Values aesthetic, minimal desk accessories. Wants a bento-box-sized B&W eInk display showing a quote, countdown, weather, or QR code — standing on its own, solar-powered.

**Room-Aware Parent / WFH User (secondary):** Values CO2/PM/VOC and presence-aware alerts surfaced as glanceable boxes on the dashboard, with a full-screen takeover when something needs attention.

**Gift Giver / Daily Glancer (tertiary):** Wants a thoughtful, personalized tech gift that works immediately, or ambient weather, schedule, and quotes visible without picking up a phone. Pre-configures via web UI.

---

## Competitive Positioning

|                | Tidbyt / TRMNL                 | InfoBento                                                  |
| -------------- | ------------------------------ | ---------------------------------------------------------- |
| **Display**    | LED matrix / 7.5" e-paper      | Good Display GDEH0576T81, 5.76" B&W eInk, 920×680, 198 DPI |
| **MCU**        | ESP32 / ESP8266 / RP2040 class | ESP32-class controller                                     |
| **Sensors**    | Usually none or DIY expansion  | Core AQ + Presence bundle on-device                        |
| **Power**      | Wall outlet required           | Solar-powered, no cable                                    |
| **Plugin/box** | DIY scripts or app marketplace | 18-box multi-box bento dashboard, up to 10 boxes           |
| **Account**    | App + account                  | Web page, no account                                       |
| **Price**      | $179 / varies                  | $30-40 target, re-validate against Core AQ + Presence BOM  |

**Verified moat (from TRMNL's own docs):**

> "Plugins do not have documented access to on-device sensors like CO2, temperature, humidity, light, or motion." — docs.trmnl.com

> "For a true embedded sensor solution on ESP32-C3, you may need custom firmware modifications beyond the standard TRMNL stack." — docs.trmnl.com

The TRMNL workaround for sensor data still requires a separate physical sensor device + a separate server. InfoBento keeps local sensors directly on the device, combined with a glanceable 5.76" B&W eInk bento dashboard.

**Tagline vs TRMNL:** "TRMNL has 850 plugins. InfoBento has lungs."

---

## Key Design Principles (Round 18 revision)

1. **Multi-Box Bento Dashboard** — The 5.76" panel hosts a multi-box dashboard (up to 10 boxes, multi-column) with big glanceable numbers; the highest-priority box can take over the full screen during alerts.
2. **Privacy by Hardware (Round 16)** — Sensor data + presence data both stay on-device. Hardware privacy switch on the back physically disconnects the radar. The cloud renderer never sees readings.
3. **Core AQ + Presence as Context** — CO2, PM, VOC, and presence readings power local boxes and alert states alongside the rest of the dashboard.
4. **Pure Function Architecture** — Stateless cloud API. Same config in, same base frame out. Sensor-aware overlay happens on-device.
5. **Free by Default** — All 18 dashboard box types work without accounts or API keys.
6. **Grayscale Elegance** — Four shades used with intention. Hero data, body text, and metadata each earn their contrast level.
7. **Web-Only Configuration** — Browser is the only config surface. No native app for v1.
8. **Solar-Powered Counter Display** — Monolithic white body, no hinge, no kickstand. Body is the stand. Sensor grille and privacy slider remain visible trust cues.

---

## Open Items (Round 18)

- **Hardware validation** — Dev kit (ESP32-C3 + GDEH0576T81) on order. Validates grey rendering, refresh speed, viewing angle.
- **Grey fallback** — If 2-bit grey looks bad on hardware, Floyd-Steinberg dithering to 1-bit as fallback (#56).
- **Sensor SKU lock + sample order** — SCD41, BME688, SEN54/PM alternative, LD2410C, AM312, LIS3DH
- **Firmware sensor pipeline** — I2C drivers, single-shot scheduling, ABC calibration, local-only data path (no cloud exposure)
- **Renderer: sensor-aware boxes** — CO2, PM, VOC/AQI, and presence-aware full-screen alert takeover
- **Industrial design: sensor layout** — grille, PIR/radar keepout, privacy slider, button, LED, USB-C, solar, and battery integrated into the ~14×11 cm housing
- **Web editor: sensor box config** — new editor surfaces, surface the on-device privacy commitment inline
- **Live sensor dashboard at infobento.com/live** — pre-launch credibility lever; standing instance of the sensor bundle posting real readings
- **Price validation:** $30-40 target needs manufacturer quotes at Kickstarter volume against the Core AQ + Presence BOM
- **Firmware:** Captive portal provisioning (#39), Wi-Fi connect, config poll, framebuffer write, deep sleep cycle.
- **Enclosure:** SCAD model (#50) for ~14×11 cm housing, ≤4 mm bezel, solar/sensor cavities, pinhole reset.
- **Founder bio** — TODO in `docs/kickstarter-copy.md`; lock before Day 0 of campaign
- **Content-aware layout:** Height allocation for all 18 box types — shipped in v0.13.0 via `computeMinHeight` per renderer.

---

## Monorepo Structure

```
infobento.com/
  packages/core/      Types, layout engine, validation (Zod)
  packages/renderer/  2-bit grayscale framebuffer generation
  packages/api/       Hono server (stateless API + static files)
  packages/web/       Vite web editor (vanilla JS, no framework)
```

**Current version:** v0.23.0
**Tests:** 28 test files across `packages/*/src/**/*.test.ts`
**Quality gate:** `npm run build && npm test && npm run lint && npm run format:check`

---

_InfoBento — See what matters. Skip the spiral. Now it can sense the room._
