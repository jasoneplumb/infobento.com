# Power Budget

InfoBento runs on a rechargeable LiPo battery topped up by a solar panel on the upper back of the enclosure. The display refreshes only 1–2×/day, so the always-on Core AQ + Presence sensors and the Wi-Fi radio — not the eInk refresh — dominate the daily energy budget.

See `docs/hardware/SENSORS.md` for the full sensor + presence + interaction bundle, and `docs/rfcs/presence-aware-paired-system.md` for firmware architecture and the v2 paired-pocket protocol.

## Design Constraints

- **Form factor:** countertop bento device. Front: Good Display GDEH0576T81 5.76" B&W eInk (920×680, 198 DPI, SSD2677, 2-bit grayscale). Back-upper: solar panel. Back/side: sensor grille, PIR/radar keepout, ESP32-C3, LiPo, charging port, pinhole reset, privacy slider.
- **MCU:** ESP32-C3 (Wi-Fi for config + frame fetch; BLE reserved for v2 paired-pocket sync)
- **Power source:** rechargeable ~2000 mAh LiPo + solar panel (upper back) via an AEM10941 harvester
- **Display:** Good Display GDEH0576T81, 5.76" B&W eInk, 920×680, 198 DPI, SSD2677 driver, 2-bit grayscale. ~0.75 s full refresh, ~0.3 s partial refresh, 1–2 refreshes/day. Exact refresh energy is unmeasured (TBD), but a full-panel refresh dominates the daily display energy at 1–2×/day.
- **AQ sensors:** SCD41 (~50 mA, 5 s every 5 min, single-shot), BME688 (~12 mA, 50 ms every 5 min, forced mode), SEN54 (~50 mA, 30 s every 15 min, fan-on)
- **Presence:** LD2410C (~75 mA active, ~285 µA average via PIR-gating + MOSFET power control), AM312 (~12 µA always-on)
- **Interaction:** LIS3DH (~1.8 µA tap-detect always-on), front button (event-driven), RGB LED (event-driven, off by default)
- **Privacy:** hardware slider switch disconnects radar power; polled at boot + every 60 s
- **Connectivity:** Wi-Fi direct (locked 2026-04-22 — see `docs/hardware/CONNECTIVITY.md`); BLE reserved for v2

## Daily Budget Summary

| Subsystem                                              | Daily mAh                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| eInk refresh (1–2× full + on-demand partial on alerts) | TBD; full-panel refresh dominates display energy at 1–2×/day |
| Wi-Fi connect + cloud poll (per refresh)               | ~0.5                                                         |
| MCU active during refresh + sensor reads               | ~0.5                                                         |
| SCD41 + BME688 + SEN54 sample cadence                  | ~1.0                                                         |
| LD2410C + AM312 PIR (presence)                         | ~0.7                                                         |
| LIS3DH + button + privacy switch + LED                 | ~0.3                                                         |
| **Total**                                              | **TBD after panel + ESP32 validation**                       |

The full-panel refresh dominates the display energy budget, but at only 1–2×/day the radio and the always-on Core AQ + Presence sensors dominate the daily total. The ~2000 mAh LiPo is sized for that always-on sensor + radar load, not the display refresh.

## Operating Profile

The device has a single power profile: countertop bento mode, refreshing 1–2×/day plus partial refreshes for alerts or view cycling.

### Countertop Bento Mode

Display facing the room. Rechargeable battery topped up by the upper-back solar panel. Scheduled full refreshes (1–2×/day) plus partial refreshes for dashboard changes.

| Component                        | Active | Sleep  | Duration                  |
| -------------------------------- | ------ | ------ | ------------------------- |
| B&W eInk full refresh (5.76")    | TBD    | 0 mA   | ~0.75 s (partial: ~0.3 s) |
| Wi-Fi connect + fetch frame      | ~70 mA | ~10 µA | ~10–20 s                  |
| MCU active (during refresh)      | ~5 mA  | ~10 µA | ~15 s                     |
| LIS3DH / button / privacy switch | TBD    | TBD    | event-driven              |

The full-panel refresh dominates per-cycle display energy, but at 1–2×/day the radio cost per cloud-rendered refresh is comparable. Wi-Fi is the dominant power cost per cloud-rendered refresh; sensor sampling and radar gating dominate the always-on budget.

## Power Sources

### Solar Harvesting

A solar panel (~$3) on the upper back of the enclosure feeds an AEM10941 harvester (~$3) that tops up the rechargeable battery, supporting the 1–2 refreshes/day plus the always-on Core AQ + Presence load. Panel placement must not compromise sensor inlets or the radar keepout.

## Open Questions

- Final battery + solar capacity for ESP32-C3 + GDEH0576T81 5.76" panel + Core AQ + Presence
- Measured full-panel and partial refresh energy for the GDEH0576T81 (SSD2677) under the 2-bit grayscale pipeline
- How much daily margin the solar harvest leaves after the refresh + sensor budget
- Wi-Fi setup UX for first-time pairing (button-assisted captive portal vs QR code containing network credentials)
- Cold-start behavior when battery is fully depleted (especially in low-light placements)
- Refresh-time tolerance — if the device is in shade for a week, does it skip refreshes silently or surface a low-power state?
- Whether to use the MCU's deep-sleep RTC alarm or wake around sensor/alert events
