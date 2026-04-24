# InfoBento

> _See what matters. Skip the spiral._

A small, solar-powered B&W eInk decorator that lives on a counter, shelf, or windowsill. Configure once on a web page; it sips light from the window and shows what matters most — weather, forecast, 8-day forecast, countdown, QR code, quote, date, moon phase, sunrise/sunset, air quality, year progress, text, stocks, tasks, calendar, habits, world clock — for months on its own.

## Overview

InfoBento is a small calm surface for the room. The information you check most often — weather, the next thing on your calendar, days until something you're looking forward to — sits there in crisp B&W eInk with 2-bit grayscale (4 levels: white, light gray, dark gray, black), visible at a glance from across the room. No Wi-Fi setup ritual, no account to make, no batteries to swap, no buttons to press.

Set it on a kitchen counter, a desk, or a shelf. The body is its own stand — slightly back-tilted so the display angles toward you. The upper portion of the back is a solar panel that charges the device from indirect light through a window. It refreshes once or twice a day, which is plenty for the things you actually look at it for. $30–40 target via Kickstarter.

### Hardware

- **Display:** Good Display GDEH0576T81, 5.76" B&W eInk, 920x680 pixels, 198 DPI, SSD2677 driver
- **Renderer:** 2-bit grayscale framebuffer with antialiased TTF fonts (Inter via opentype.js), SDF-based rounded box borders, configurable corner radius (0-5) and padding (0-10), font size slider (8-42px)
- **MCU:** ESP32-C3 (production), ESP32-L dev kit for validation (Wi-Fi 4 + BLE 5; BLE radio reserved for a possible v2 bridge mode)
- **Power:** 100 mAh LiPo + AEM10941 solar harvester
- **Solar panel:** mounted on the upper portion of the back side, ~70×100 mm
- **Connectivity:** Wi-Fi direct + captive-portal setup; no companion phone app. Web editor at `infobento.com` is the only configuration surface. See `docs/hardware/CONNECTIVITY.md`.
- **Recovery:** recessed pinhole reset (~2mm) on the back-lower grip area; press with paperclip for 5s = factory reset.
- **Form factor:** monolithic body. No hinge, no kickstand, no MagSafe. The body is the stand.
- **Industrial design:** white housing, thin bezel (≤4mm visible)
- **Drop survival:** designed to survive a 4-foot drop onto a hard surface — soft polymer bumper between glass and housing, edge-radiused corners, inset display recess

### Form factor

```
┌────────────────────┐  ◄── thin white bezel
│                    │
│   B&W eInk         │      Front: display recessed below bezel rim
│   panel            │             so the rim shields the glass on
│                    │             a face-down drop
│                    │
└────────────────────┘
       ▲                   Back-upper: solar panel
       │ ~12-15° tilt      Back-lower: ESP32 + battery + grip area
       │ when set down
```

### Architecture

```
┌─────────────────┐    Wi-Fi     ┌──────────────┐
│     Device       │◄────────────►│  Cloud API   │
│  B&W eInk        │              │ (stateless)  │
│  ESP32 + solar   │              └──────────────┘
└─────────────────┘                      ▲
                                         │
                                   ┌─────┴─────┐
                                   │  Web UI    │
                                   │  (config)  │
                                   └───────────┘
```

The cloud API is a pure function: BentoConfig in, frame buffer out. The device polls or subscribes for updated frames on its refresh schedule. The web editor is where you set up your boxes; configuration lives in browser localStorage and can be exported/imported as JSON.

## Quick Start

```bash
# Clone and install
git clone https://github.com/jasoneplumb/infobento.com.git
cd infobento.com
npm install

# Build and verify
npm run build
npm test
npm run lint
```

## Monorepo Structure

| Package              | Name                  | Purpose                                     |
| -------------------- | --------------------- | ------------------------------------------- |
| `packages/core/`     | `@infobento/core`     | Types, bento box definitions, layout engine |
| `packages/renderer/` | `@infobento/renderer` | eInk frame buffer generation                |
| `packages/api/`      | `@infobento/api`      | Stateless pure-function cloud API           |
| `packages/web/`      | `@infobento/web`      | Web configuration interface                 |

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

## Status

Active development. Renderer produces 2-bit grayscale framebuffers with 17 box types. Web editor at localhost:5173 for configuration. Hardware validation pending (GDEH0576T81 dev kit on order).
