# Power Budget

## Round 18 amendment (2026-06-06)

Round 18 supersedes the Round 17 display + power-source pivot. The panel returns to the canonical Good Display **GDEH0576T81** — the 5.76" B&W eInk module the code and firmware never moved off — and **solar + battery** is restored as the power story. The Round 17 swap to a Waveshare 2.13" SPI panel on USB-C-only power is retired; it was never reflected in `core`/`renderer`/CLAUDE.md. Core AQ + Presence sensors are retained exactly as specced in Rounds 15/16.

Canonical assumptions:

- **Display:** Good Display GDEH0576T81, 5.76" B&W eInk, 920×680, 198 DPI, SSD2677 driver, 2-bit grayscale. ~0.75 s full refresh, ~0.3 s partial refresh, 1–2 refreshes/day. Exact 5.76" refresh-energy figures are unmeasured, but a full-panel refresh dominates the daily display energy budget at 1–2×/day.
- **MCU:** ESP32-class controller; Wi-Fi for config/frame fetch, BLE reserved for future paired-pocket work.
- **Power source:** rechargeable battery + solar panel on the upper back. Solar returns as part of the 5.76" power story; the Round 17 "solar is not a requirement" call is superseded.
- **Battery:** re-spec after ESP32 module, panel, enclosure, and sensor duty cycle are validated.
- **Sensors:** Core AQ + Presence remains in scope; sensors and the radio still dominate the daily budget more than the once-or-twice-daily display refresh.

## Round 17 amendment (2026-05-07) — superseded by Round 18

Round 17 reopened the power budget around the Waveshare 2.13" Rev 2.1 display and an ESP32-class controller driven over 3- or 4-line SPI, with USB-C-only power and solar dropped. This display + power-source pivot is **superseded by Round 18** (5.76" GDEH0576T81, solar + battery restored). The Core AQ + Presence direction Round 17 introduced is retained.

Historical Round 17 assumptions (display + power source no longer current):

- **Display (retired):** Waveshare 2.13" black/white e-paper, 250×122, SPI, ~2s full refresh, ~0.3s partial refresh, ~26.4mW typical refresh power
- **MCU:** ESP32-class controller; Wi-Fi for config/frame fetch, BLE reserved for future paired-pocket work
- **Power source (retired):** USB-C rechargeable battery. Solar is not a Round 17 requirement.
- **Battery:** reopened after ESP32 module, panel, enclosure, and sensor duty cycle are validated.
- **Sensors:** Core AQ + Presence remains in scope, so sensors still dominate the daily budget more than the smaller display.

## Round 14 / 15 / 16 history

- **Round 14:** solar dropped from marketing; USB-C charging once every ~6 months. Sensor bundle (SCD41 + BME688 + VEML7700 + AM312 PIR) added.
- **Round 15:** AQ-monitor repositioning post Seeed reTerminal E entry. Sensor bundle revised: dropped VEML7700, added Sensirion SEN54 PM (the marquee asthma-parent feature). Battery sized up to support the SEN54 fan duty cycle.
- **Round 16:** added presence detection (HLK-LD2410C mmWave + AM312 PIR for cheap wake / power-gating + hardware privacy switch) and minimal interaction (LIS3DH knock-detect, 1 button, RGB LED). Battery further sized up to ~2000 mAh.

See `docs/hardware/SENSORS.md` for the full sensor + presence + interaction bundle, and `docs/rfcs/round-16-presence-aware-paired-system.md` for firmware architecture and the v2 paired-pocket protocol.

## Design Constraints

- **Form factor:** countertop bento device. Front: Good Display GDEH0576T81 5.76" B&W eInk (920×680, SSD2677). Back-upper: solar panel. Back/side: sensor grille, PIR/radar keepout, ESP32, LiPo, charging port, pinhole reset, privacy slider.
- **MCU:** ESP32-class controller (Wi-Fi + BLE; BLE reserved for v2 paired-pocket sync)
- **Power source:** rechargeable battery + solar panel (upper back)
- **Battery:** reopened; re-spec after sensor + presence burn-in on the board
- **AQ sensors:** SCD41 (~50 mA, 5s every 5 min, single-shot), BME688 (~12 mA, 50 ms every 5 min, forced mode), SEN54 (~50 mA, 30 s every 15 min, fan-on)
- **Presence:** LD2410C (~75 mA active, ~285 µA average via PIR-gating + MOSFET power control), AM312 (~12 µA always-on)
- **Interaction:** LIS3DH (~1.8 µA tap-detect always-on), front button (event-driven), RGB LED (event-driven, off by default)
- **Privacy:** hardware slider switch disconnects radar power; polled at boot + every 60 s
- **Connectivity:** Wi-Fi direct (locked 2026-04-22 — see `docs/hardware/CONNECTIVITY.md`); BLE reserved for v2

## Daily budget summary

| Subsystem                                              | Daily mAh                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| eInk refresh (1–2× full + on-demand partial on alerts) | TBD; full-panel 5.76" refresh dominates display energy at 1–2×/day |
| Wi-Fi connect + cloud poll (per refresh)               | ~0.5                                                               |
| MCU active during refresh + sensor reads               | ~0.5                                                               |
| SCD41 + BME688 + SEN54 sample cadence                  | ~1.0                                                               |
| LD2410C + AM312 PIR (presence)                         | ~0.7                                                               |
| LIS3DH + button + privacy switch + LED                 | ~0.3                                                               |
| **Total**                                              | **TBD after panel + ESP32 validation**                             |

The 5.76" full-panel refresh dominates the display energy budget, but at only 1–2×/day the radio and the always-on Core AQ + Presence sensors still dominate the daily total. Do not carry forward the Round 16 2000 mAh / 6-month claim until the board is measured against the GDEH0576T81 refresh load and the solar harvest budget.

## Operating Profile

The device has a single power profile: countertop bento mode, refreshing 1–2× per day plus partial refreshes for alerts or view cycling. There is no phone-mounted minute-level mode.

### Countertop Bento Mode

Display facing the room. Rechargeable battery topped up by the upper-back solar panel. Scheduled full refreshes (1–2×/day) plus partial refreshes for dashboard changes.

| Component                        | Active | Sleep  | Duration                  |
| -------------------------------- | ------ | ------ | ------------------------- |
| B&W eInk full refresh (5.76")    | TBD    | 0 mA   | ~0.75 s (partial: ~0.3 s) |
| Wi-Fi connect + fetch frame      | ~70 mA | ~10 µA | ~10–20 s                  |
| MCU active (during refresh)      | ~5 mA  | ~10 µA | ~15 s                     |
| LIS3DH / button / privacy switch | TBD    | TBD    | event-driven              |

**Per refresh cycle:** reopened for ESP32 + GDEH0576T81 panel validation. The full-panel refresh dominates per-cycle display energy, but at 1–2×/day the radio cost per cloud-rendered refresh is comparable.

Wi-Fi is the dominant power cost per cloud-rendered refresh. Sensor sampling and radar gating dominate the always-on budget.

## Power Sources

### Solar Harvesting

**Restored in Round 18.** A solar panel on the upper back of the 5.76" enclosure tops up the rechargeable battery, supporting the 1–2 refreshes/day plus the always-on Core AQ + Presence load. Panel size and harvester are re-spec'd against the GDEH0576T81 refresh load and the sensor duty cycle; placement must not compromise sensor inlets or the radar keepout. (Round 17 had dropped solar for the 2.13" USB-C-only direction — that call is superseded.)

### MagSafe Reverse Charging

**Removed.** No phone-mounted mode means no MagSafe Qi receiver. Removed from BOM and PCB.

## Open Questions

- Final battery + solar capacity for ESP32 + GDEH0576T81 5.76" panel + Core AQ + Presence
- Measured full-panel and partial refresh energy for the GDEH0576T81 (SSD2677) under the 2-bit grayscale pipeline
- Solar panel size / harvester pick and how much daily margin it leaves after the refresh + sensor budget
- Wi-Fi setup UX for first-time pairing (button-assisted captive portal vs QR code containing network credentials)
- Cold-start behavior when battery is fully depleted (especially in low-light placements)
- Refresh-time tolerance — if the device is in shade for a week, does it skip refreshes silently or surface a low-power state?
- Whether to use the MCU's deep-sleep RTC alarm or wake around sensor/alert events
