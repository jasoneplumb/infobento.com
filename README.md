# InfoBento

> _See what matters. Skip the spiral._

A small, solar-powered color eInk decorator that lives on a counter, shelf, or windowsill. Configure once on a web page; it sips light from the window and shows what matters most — weather, your next meeting, a countdown, a quote — for months on its own.

## Overview

InfoBento is a small calm surface for the room. The information you check most often — weather, the next thing on your calendar, days until something you're looking forward to — sits there in soft color eInk, visible at a glance from across the room. No Wi-Fi setup ritual, no account to make, no batteries to swap, no buttons to press.

Set it on a kitchen counter, a desk, or a shelf. The body is its own stand — slightly back-tilted so the display angles toward you. The upper portion of the back is a solar panel that charges the device from indirect light through a window. It refreshes once or twice a day, which is plenty for the things you actually look at it for. $30–40 target via Kickstarter.

### Hardware

- **Display:** color eInk panel (size and palette pending — see `docs/hardware/DISPLAY.md` for current candidates)
- **MCU:** ESP32-C3 (Wi-Fi 4 + BLE 5; BLE radio reserved for a possible v2 bridge mode)
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
│   color eInk       │      Front: display recessed below bezel rim
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
│  color eInk      │              │ (stateless)  │
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

Mid-pivot from a previous dual-display MagSafe clamshell concept to the counter-only color decorator described above. See RFC #25 and the `pivot/counter-color` milestone for in-flight phase work. Code in `main` still ships some clamshell-era abstractions (1-bit renderer, dual-display web editor) that are being migrated phase-by-phase.
