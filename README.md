# InfoBento

> _See what matters. Skip the spiral._

A small, solar-powered eInk decorator that lives on a counter, shelf, or windowsill. Configure once on a web page; it sips light from the window and shows what matters most — weather, 8-hour forecast, 8-day forecast, calendar, quote, countdown, stocks, QR code, text, date, moon phase, sunrise/sunset, air quality, year progress, habits, horoscope, joke, on this day — for months on its own.

## Overview

InfoBento is a small calm surface for the room. The information you check most often — weather, the next thing on your calendar, days until something you're looking forward to — sits there in crisp eInk, visible at a glance from across the room. No Wi-Fi setup ritual, no account to make, no batteries to swap, nothing to fiddle with day to day.

Set it on a kitchen counter, a desk, or a shelf. The body is its own stand, with a fold-out kickstand to angle the display toward you if needed. The upper portion of the back is a solar panel that charges the device from indirect light through a window. It refreshes once or twice a day, which is plenty for the things you actually look at it for. $49–69 via Kickstarter (≈ $45–50 BOM at volume — the 5.76" panel dominates).

### Hardware

- **Display:** Good Display GDEH0576T81, 5.76" eInk, 920x680 pixels, 198 DPI, SSD2677 driver
- **Renderer:** eInk framebuffer with antialiased TTF fonts (Inter via opentype.js), SDF-based rounded box borders, configurable corner radius (0-10) and padding (0-10), font size slider (8-42px)
- **MCU:** ESP32-C3 (Wi-Fi 4 + BLE 5; BLE radio reserved for a possible v2 bridge mode)
- **Power:** ~100 mAh LiPo + AEM10941 solar harvester
- **Solar panel:** mounted on the upper portion of the back side, ~70×100 mm
- **Connectivity:** Wi-Fi direct + captive-portal setup; no companion phone app. Web editor at `infobento.com` is the only configuration surface. See `docs/hardware/CONNECTIVITY.md`.
- **Recovery:** recessed pinhole reset (~2mm) on the back-lower grip area; press with paperclip for 5s = factory reset.
- **Form factor:** monolithic body, no hinge. The body stands on its own, with a fold-out kickstand to angle the display if needed.
- **Orientation:** two ball-in-tube tilt switches mounted at 90° on GPIO interrupts; firmware auto-rotates the layout across landscape, portrait, and inverted variants. Zero standby current, ~$0.10 BOM.
- **Industrial design:** white housing, thin bezel (≤4mm visible)
- **Drop survival:** designed to survive a 4-foot drop onto a hard surface — soft polymer bumper between glass and housing, edge-radiused corners, inset display recess

### Form factor

```
┌────────────────────┐  ◄── thin white bezel
│                    │
│   eInk             │      Front: display recessed below bezel rim
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
│  eInk            │              │ (stateless)  │
│  ESP32 + solar   │              └──────────────┘
└─────────────────┘                      ▲
                                         │
                                   ┌─────┴─────┐
                                   │  Web UI    │
                                   │  (config)  │
                                   └───────────┘
```

The cloud API is a pure function: BentoConfig in, frame buffer out. The server renders the framebuffer; the device caches the last framebuffer in flash for offline resilience (stale display, not blank). First-time setup via captive portal; config updates polled from cloud via `infobento.com/api/config/{device-id}`. The web editor is where you set up your boxes; configuration lives in browser localStorage and can be exported/imported as JSON.

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

## Self-hosting & auth env vars

The hosted SaaS (`infobento.com`) is the default path, but the API code is
public so you can run it yourself. The auth flows in `@infobento/api` need
the following env vars at runtime:

| Variable               | Purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `SESSION_SECRET`       | HMAC key for session + challenge cookies. Required. ≥16 chars, generate randomly.    |
| `RP_ID`                | WebAuthn Relying Party ID — your domain (e.g. `infobento.com`).                      |
| `RP_ORIGIN`            | Origin(s) the browser will use, comma-separated (e.g. `https://infobento.com`).      |
| `OAUTH_REDIRECT_BASE`  | Base URL for OAuth callbacks (e.g. `https://infobento.com/api/auth/oauth`).          |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID. Get from console.cloud.google.com → Credentials.             |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret.                                                          |
| `APPLE_CLIENT_ID`      | Apple "Service ID" identifier (e.g. `com.example.signin`).                           |
| `APPLE_TEAM_ID`        | Apple Developer team ID (10-char alphanumeric).                                      |
| `APPLE_KEY_ID`         | Apple "Sign in with Apple" private key ID (10-char alphanumeric).                    |
| `APPLE_PRIVATE_KEY`    | PEM-encoded ES256 private key (PKCS8) for Apple. Multi-line — use the literal value. |
| `INFOBENTO_DB_PATH`    | (Optional) SQLite file path. Default `/var/lib/infobento/data.db`.                   |

Setting up the OAuth credentials:

- **Google** — create an OAuth 2.0 Client ID (Web application) at
  [console.cloud.google.com → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
  Authorized redirect URI: `https://<your-domain>/api/auth/oauth/google/callback`.
- **Apple** — at [developer.apple.com → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list):
  1. Create an App ID with "Sign in with Apple" capability.
  2. Create a Services ID (this is your `APPLE_CLIENT_ID`); enable Sign in with Apple
     and configure return URLs: `https://<your-domain>/api/auth/oauth/apple/callback`.
  3. Create a Key with "Sign in with Apple" enabled; download the `.p8` and note the
     Key ID (`APPLE_KEY_ID`). Your team ID is in the top-right of the Developer portal.

If neither OAuth provider is configured, the app falls back to passkey-only
auth (still usable on any modern browser/OS). Passkey login does not require
OAuth credentials at all.

## Manufacturing: device stickers

Each device ships with a sticker carrying a QR code that opens its pairing page
(`/pair/<pair_code>`) plus the human-readable pair code as a camera-free fallback.
Generate sticker artwork from a CSV of minted devices:

```bash
# CSV columns: device_id,pair_code  (header row optional)
npm run gen-stickers -- scripts/sample-devices.csv stickers/

# Add a tiled, print-ready batch sheet (A4 by default; --page letter for US):
npm run gen-stickers -- devices.csv stickers/ --sheet --page letter

# Point the QR at a non-production origin (self-host / staging):
npm run gen-stickers -- devices.csv stickers/ --base-url https://staging.infobento.com
```

Output is one `<device_id>.svg` per row (designed to print at 25mm × 25mm) and,
with `--sheet`, a `sheet.svg` you can open in a browser and Print → PDF. Pair
codes are validated against the minting alphabet, so a typo in the CSV fails
loudly instead of producing an unscannable sticker. The QR encodes only the pair
code — never the device id, which is the firmware's bearer secret.

Mint the devices first with [`scripts/mint-device.ts`](scripts/mint-device.ts).

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

## License

InfoBento is open-source hardware. Each part of the repo uses the license that
fits the work, and **all of them permit building and selling devices based on
this design**:

- **Software** (`packages/`, `scripts/`, root) — [Apache-2.0](LICENSE)
- **Hardware** (`hardware/`) — [CERN-OHL-P-2.0](hardware/LICENSE)
- **Documentation** (`docs/`) — [CC-BY-4.0](docs/LICENSE)

See [LICENSING.md](LICENSING.md) for the full breakdown. Copyright © 2026 Jason
E Plumb and InfoBento contributors.

## Status

Active development (v0.29.0). Renderer produces framebuffers with 18 box types. Web editor at localhost:5173 for configuration. Passkey + Apple/Google OAuth and the SaaS device-pairing flow are shipped in `@infobento/api` (epic #77 complete). Firmware bring-up is dev-first on the reTerminal E1001: blink, static-frame, and Wi-Fi device-pull all bench-verified (epic #106, Phases 1–3). Production-panel validation pending the GDEH0576T81 dev kit (#57).
