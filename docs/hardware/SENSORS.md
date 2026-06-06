> **Intent:** Specify the local air-quality, presence, and interaction hardware that supports the InfoBento multi-box bento dashboard.
> **Context:** InfoBento is a 5.76" B&W eInk bento dashboard (Good Display GDEH0576T81, 920×680, 198 DPI, SSD2677, 1–2 refreshes/day, ESP32-C3) with a Core AQ + Presence + interaction sensor bundle.
> **Pattern:** Treat sensor readings as local context for dashboard boxes and alert states; never require the cloud renderer to see readings.
> **Future:** Validate component and battery sizing after prototype burn-in on the 5.76" device.

# Sensor + Presence + Interaction Bundle

InfoBento's primary hardware moat is the integrated AQ-sensor + presence-detection + minimal-interaction bundle. This document specifies the SKUs, bus layout, calibration approach, privacy commitment, and on-device data pipeline.

## Product context

The product is the **5.76" Bento Dashboard + Core AQ + Presence**:

- The display is the Good Display **GDEH0576T81**, 5.76" B&W eInk, 920×680 px, 198 DPI, SSD2677 driver, 2-bit grayscale (4 levels), refreshing 1–2×/day, driven by an ESP32-C3 controller.
- The UX is a multi-box bento dashboard (up to 10 boxes, `MAX_BOXES=10`), multi-column, with big glanceable numbers and a high-priority box / full-screen alert takeover.
- The sensor bundle is local context for dashboard boxes and alert states.
- Industrial design is built around the 5.76" face; grille, radar keepout, privacy slider, button, LED, USB-C, and battery placement follow the 5.76" enclosure.
- Aranet4/AirGradient/Awair/AirThings remain sensor references, not the primary product category.

## TRMNL sensor moat (verified)

> "Plugins do not have documented access to on-device sensors like CO2, temperature, humidity, light, or motion." — docs.trmnl.com
>
> "For a true embedded sensor solution on ESP32-C3, you may need custom firmware modifications beyond the standard TRMNL stack." — docs.trmnl.com

## Current bundle

### Air-quality sensors

| Component           | Function                            | I2C Addr       | Cost (~qty 1k) | Notes                                                                           |
| ------------------- | ----------------------------------- | -------------- | -------------- | ------------------------------------------------------------------------------- |
| Sensirion **SCD41** | NDIR CO2 + temp + humidity          | 0x62           | ~$13.50        | The chip Aranet4 uses. Single-shot mode + ABC.                                  |
| Bosch **BME688**    | VOC/IAQ + pressure + redundant T/RH | 0x76 (or 0x77) | ~$5.20         | BSEC library required for calibrated IAQ.                                       |
| Sensirion **SEN54** | PM1/PM2.5/PM10                      | 0x69           | ~$25.00        | Forced fan-on samples; spec firmware to support SEN5x family for supplier swap. |

For prototype phase, use Adafruit breakouts:

- SCD41: Adafruit #5190
- BME688: Adafruit #5046
- SEN54: Adafruit #5187

### Presence detection

| Component                            | Function                                                                                    | Interface          | Cost (~qty 1k) | Notes                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------ | -------------- | ------------------------------------------------------------------------------------- |
| **HLK-LD2410C**                      | mmWave radar (24 GHz FMCW); detects breathing micro-motion (sees sitting humans PIR misses) | UART (115200 baud) | ~$5.00         | Power-gated by MOSFET via ESP32-C3 GPIO; runs only when PIR fires or 30s sanity poll. |
| **AM312** mini PIR                   | Cheap motion interrupt for waking ESP32-C3 + radar power-gating                             | GPIO interrupt     | ~$0.80         | Always-on (~12 µA).                                                                   |
| Hardware **privacy switch** (slider) | Physically disconnects radar power                                                          | GPIO read          | ~$0.30         | On the back, near pinhole reset. Read at boot AND every 60s.                          |

### Interaction

| Component                                       | Function                                                                                            | Interface               | Cost (~qty 1k) | Notes                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| **LIS3DH**                                      | Accelerometer; knock-to-dismiss (double-tap the side at 3am to silence the alert)                   | I2C 0x18                | ~$1.20         | Always-on tap-detect mode: ~1.8 µA (LIS3DH datasheet, ODR=10Hz, LP mode). INT1 → ESP32-C3 wake pin. |
| 1× front tactile button (C&K PTS645)            | Acknowledge alert / cycle metric                                                                    | GPIO interrupt          | ~$0.50         | Table stakes vs Aranet4; without one, reviewers say "you can't even acknowledge an alert."          |
| **SK6812** RGB LED behind frosted dot, dimmable | Across-room glance: amber pulse on alert escalation, visible from 4m where eInk refresh is too slow | WS2812 protocol on GPIO | ~$0.50         | Off by default; nighttime auto-off; user-toggleable in web editor.                                  |

### Industrial design hardware

| Component                              | Function                                                                            | Cost                       |
| -------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| Hex grille on back panel               | Covers SCD41/BME688/SEN54 inlets — designed as the brand mark, not a speaker grille | ~$2.00 (tooling amortized) |
| PIR dome at top-bezel                  | Standard eyeball lens for AM312                                                     | ~$0.50                     |
| Light pipe for RGB LED                 | Diffuses LED through frosted dot                                                    | ~$0.30                     |
| Plastic keepout zone for radar antenna | LD2410C antenna detunes through plastic — needs careful keepout                     | (ID time, no BOM)          |
| Lanyard / wall-mount keyhole           | Free wall mount for nursery use                                                     | ~$0.10                     |
| ID hardware subtotal                   |                                                                                     | **~$2.90**                 |

### Total

The sensor + presence + interaction bundle subtotal is **~$56**. The whole device BOM is **≈ $110–115 at Kickstarter volume** (sensor bundle ~$56 + core platform ~$57: GDEH0576T81 panel ~$30, ESP32-C3 ~$2.50, ~2000 mAh LiPo ~$6, solar+harvester ~$6, USB-C ~$2, PCB+passives ~$4, housing ~$6), supporting **$129–179 retail**.

### Reserved / rejected

| Component                 | Decision        | Why                                                                                           |
| ------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| VEML7700 ambient lux      | Removed         | Doesn't differentiate vs reTerminal + GPIO header; not persona-critical                       |
| ToF distance (VL53L1X)    | Rejected        | Cute, not meaningful; counter device doesn't need gesture                                     |
| Microphone (ICS-43434)    | **Rejected**    | Catastrophic privacy optics in a kid's bedroom regardless of on-device-only processing claims |
| Capacitive touch overlay  | Rejected        | $18–28 BOM kills price ladder; glass surface contradicts "calm appliance"                     |
| Piezo buzzer              | Rejected        | Audible alerts violate "calm" — Aranet4's silence is _why_ parents trust it                   |
| Speaker + Class-D amp     | Rejected        | Same as buzzer + worse                                                                        |
| Rotary encoder            | Rejected        | Threshold-tuning belongs in the web UI you already built; encoder = tinker-tool               |
| Scroll wheel / crown      | Rejected        | Months of ID for a feature nobody asked for                                                   |
| Multi-zone radar (LD6001) | Rejected for v1 | Direction-awareness is delight, not persona-critical; doubles privacy concern                 |
| Magnetic mount            | Rejected        | Bento is too big for a fridge; $2 solving a non-problem                                       |
| Qi wireless charging      | Rejected        | $3 solving a once-per-6-months problem                                                        |

## Bus layout (ESP32-class draft)

This table is a starting point, not a pin lock. The prototype path may use an off-the-shelf ESP32 dev-board pin mapping for the 5.76" GDEH0576T81 (SSD2677) panel first, then collapse into a custom board after the multi-box bento UI and sensor cadence are validated.

| Pin     | Function                               |
| ------- | -------------------------------------- |
| GPIO 0  | I2C SDA (SCD41, BME688, SEN54, LIS3DH) |
| GPIO 1  | I2C SCL (same bus)                     |
| GPIO 2  | AM312 PIR interrupt                    |
| GPIO 3  | LD2410C UART RX                        |
| GPIO 4  | SPI SCK (eInk panel)                   |
| GPIO 5  | SPI CS (eInk)                          |
| GPIO 6  | eInk DC                                |
| GPIO 7  | SPI MOSI (eInk)                        |
| GPIO 8  | eInk BUSY                              |
| GPIO 9  | eInk RST                               |
| GPIO 10 | LD2410C UART TX                        |
| GPIO 11 | Radar power-gate MOSFET                |
| GPIO 12 | LIS3DH INT1 (knock interrupt)          |
| GPIO 13 | RGB LED (SK6812 data)                  |
| GPIO 14 | Front tactile button                   |
| GPIO 15 | Privacy switch read                    |
| GPIO 18 | tilt / spare / board-specific          |
| GPIO 19 | tilt / spare / board-specific          |
| GPIO 20 | SEN54 SEL (I2C address select)         |

Tight on GPIOs. If a pin pinch occurs, use 4-wire SPI by default and drop dedicated tilt switches first. The LIS3DH can cover both knock detection and orientation reads over I2C.

## Sample schedule (firmware)

| Sensor         | Mode                               | Cadence                                                       | Active power                   |
| -------------- | ---------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| SCD41          | Single-shot                        | Every 5 min during awake window                               | ~50 mA × 5s                    |
| BME688         | Forced                             | Every 5 min                                                   | ~12 mA × 50ms                  |
| SEN54          | Measurement (fan on)               | 30s sample every 15 min                                       | ~50 mA × 30s                   |
| HLK-LD2410C    | PIR-gated burst, MOSFET-controlled | 500 ms every 30 s when PIR-quiet; 5s every 5s when PIR-active | ~75 mA active, ~285 µA average |
| AM312 PIR      | Always-on                          | continuous                                                    | ~12 µA                         |
| LIS3DH         | Tap-detect always-on               | continuous                                                    | ~1.8 µA                        |
| Front button   | GPIO interrupt                     | event-driven                                                  | 0 µA                           |
| Privacy switch | Polled at boot + every 60s         | continuous                                                    | <1 µA                          |
| RGB LED        | Off by default                     | event-driven (5s amber pulse on escalated alert)              | <1 µA average                  |

The sensors + presence + interaction bundle adds ~2.5 mAh/day. The full device daily energy budget is being validated against the GDEH0576T81 refresh load (1–2 refreshes/day) and solar harvest on a ~2000 mAh battery, alongside ESP32 module choice, board layout, and sensor duty cycle.

## Calibration

**SCD41 NDIR CO2:** automatic baseline calibration (ABC) enabled by default. ABC assumes the sensor sees fresh outdoor air (~400 ppm) at least once every 7 days; the sensor self-corrects baseline drift using the lowest-CO2 reading from that window. Document the 7-day calibration window in user-facing FAQ. **Honesty constraint:** never claim ±50 ppm in marketing copy; claim "actionable thresholds for households."

**BME688 BSEC:** the Bosch BSEC library is required for calibrated VOC/IAQ index. Cold-start IAQ takes ~5 min "burn-in" — document this. After burn-in, IAQ index is stable for "air quality: poor" thresholds.

**SEN54:** factory-calibrated PM. Document the saturation behavior: "after a smoky dinner, the box reads HIGH for 10–20 min then catches up." Fan kicks on for sample, off otherwise.

**LD2410C:** distance gates configurable (0.75 m increments out to 6 m); ship with conservative defaults (≥0.75 m gate, low sensitivity) to minimize false positives from ceiling fans, curtains, pets. Provide tuning UI in v2 web editor.

**LIS3DH:** factory-calibrated; double-tap threshold tunable in firmware (start at 32 LSB / ~250 ms inter-tap window).

**VEML7700:** removed / no calibration applicable.

**AM312:** retained as a binary PIR wake/power-gating input; no calibration beyond placement and false-trigger validation.

## Privacy commitment (firmware-level)

**Sensor data + presence data both stay on-device by default.**

The cloud renderer at `infobento.com/api/render` receives only the BentoConfig JSON — it has no field for sensor or presence readings. After the cloud returns the base framebuffer, the firmware overlays sensor-aware boxes (CO2, AQI-local, PM-local, presence-aware adaptive layout) using local readings before drawing to the panel.

This is enforced in firmware design:

- Sensor + presence readings live in NVS / RAM only
- Box-rendering logic on-device evaluates thresholds (CO2 >1000 ppm AND presence_minutes ≥ 30 → escalate to "open a window" tile + RGB amber pulse; VOC >150 → "air quality: poor" full-bar; SEN54 PM2.5 >12 µg/m³ AND presence_minutes ≥ 30 → escalate)
- HTTP requests to the cloud carry no sensor or presence data — verifiable via Wireshark / mitmproxy capture as part of CI
- Hardware privacy switch on the back disconnects radar power within 1 second of toggle; presence_minutes counter resets

Optional opt-in for trends/dashboard sync is a v2 feature behind an explicit user toggle.

## Industrial design

The hex grille on the back panel covers the SCD41 / BME688 / SEN54 air inlets. The grille is **photographable as a brand mark, not a speaker grille** — distinctive hex pattern at a specific spacing, briefed to the ID firm from day one. The PIR sits in a small dome at the top-bezel; the LD2410C antenna sits behind a plastic keepout zone (no metal, no painted surface). The RGB LED sits behind a 3 mm frosted dot. The privacy switch is a slider on the back near the pinhole reset, with a small lit indicator visible when the radar is powered.

Industrial-design contract: the back-panel sensor grille + the privacy switch + the radar antenna keepout zone are the three visible "this device thinks about your privacy" cues in product photography. They are load-bearing visual elements of the campaign.

## References

See `~/.claude/plans/using-several-agents-develop-radiant-hearth.md` (marketing plan) and `docs/rfcs/presence-aware-paired-system.md` (firmware architecture + paired-pocket BLE protocol).
</content>
</invoke>
