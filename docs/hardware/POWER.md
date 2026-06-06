# Power Budget

InfoBento runs on a small rechargeable LiPo battery topped up by a solar panel on the upper back of the enclosure. It is a calm dashboard: the display refreshes only 1–2×/day, and the device has zero interaction. The only loads are the eInk refresh and a Wi-Fi cloud poll at 1–2×/day, so the daily energy budget is small and comfortably covered by a ~100 mAh LiPo with solar margin to spare.

## Design Constraints

- **Form factor:** countertop bento device. Front: Good Display GDEH0576T81 5.76" eInk (920×680, 198 DPI, SSD2677). Back-upper: solar panel. Back/side: ESP32-C3, LiPo, charging port, pinhole reset. A fold-out kickstand props the device at a viewing tilt on the countertop.
- **MCU:** ESP32-C3 (Wi-Fi for config + frame fetch; BLE reserved for v2)
- **Power source:** rechargeable ~100 mAh LiPo + solar panel (~70×100 mm, upper back) via an AEM10941 harvester
- **Display:** Good Display GDEH0576T81, 5.76" eInk, 920×680, 198 DPI, SSD2677 driver. ~0.75 s full refresh, ~0.3 s partial refresh, 1–2 refreshes/day. Exact refresh energy is unmeasured (TBD), but a full-panel refresh dominates the daily display energy at 1–2×/day.
- **Interaction:** none. The device has no buttons, sensors, or indicators — it wakes on a schedule, fetches a frame, refreshes, and returns to deep sleep. A tilt switch is the only mechanical input, used to detect the fold-out kickstand orientation.
- **Connectivity:** Wi-Fi direct (locked 2026-04-22 — see `docs/hardware/CONNECTIVITY.md`); BLE reserved for v2

## Daily Budget Summary

| Load                                                   | Daily mAh                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| eInk refresh (1–2× full + on-demand partial on alerts) | TBD; full-panel refresh dominates display energy at 1–2×/day |
| Wi-Fi connect + cloud poll (per refresh)               | ~0.5                                                         |
| MCU active during refresh                              | ~0.5                                                         |
| **Total**                                              | **TBD after panel + ESP32 validation; well under 100 mAh**   |

With no always-on loads, the daily total is dominated by the eInk refresh and the Wi-Fi poll, both incurred only 1–2×/day. Between refreshes the ESP32-C3 sits in deep sleep at single-digit µA. A ~100 mAh LiPo covers many days of operation on a single charge, and the solar panel keeps it topped up.

## Operating Profile

The device has a single power profile: countertop bento mode, refreshing 1–2×/day plus partial refreshes for alerts or view cycling.

### Countertop Bento Mode

Display facing the room, propped on the fold-out kickstand. Rechargeable battery topped up by the upper-back solar panel. The MCU wakes on a deep-sleep RTC alarm, connects to Wi-Fi, fetches a cloud-rendered frame, performs a full or partial refresh, and returns to deep sleep.

| Component                   | Active | Sleep  | Duration                  |
| --------------------------- | ------ | ------ | ------------------------- |
| eInk full refresh (5.76")   | TBD    | 0 mA   | ~0.75 s (partial: ~0.3 s) |
| Wi-Fi connect + fetch frame | ~70 mA | ~10 µA | ~10–20 s                  |
| MCU active (during refresh) | ~5 mA  | ~10 µA | ~15 s                     |

Wi-Fi is the dominant power cost per cloud-rendered refresh. With no always-on subsystems, the deep-sleep current floor sets the only continuous draw, and it is negligible against the daily budget.

## Power Sources

### Solar Harvesting

A ~70×100 mm solar panel (~$3) on the upper back of the enclosure feeds an AEM10941 harvester (~$3) that tops up the rechargeable LiPo. Because the only loads are 1–2 refreshes/day, the harvest target is modest and the solar margin is generous even in indoor light. Panel placement should favor the upper-back facet so a kickstand-tilted device still catches ambient light.

## Open Questions

- Final battery + solar capacity for ESP32-C3 + GDEH0576T81 5.76" panel under the calm 1–2×/day profile
- Measured full-panel and partial refresh energy for the GDEH0576T81 (SSD2677) under the current render pipeline
- How much daily margin the ~100 mAh LiPo + solar harvest leaves after the refresh + Wi-Fi budget
- Wi-Fi setup UX for first-time pairing (captive portal vs QR code containing network credentials), given there is no button
- Cold-start behavior when the battery is fully depleted (especially in low-light placements)
- Refresh-time tolerance — if the device is in shade for a week, does it skip refreshes silently or surface a low-power state?
- Deep-sleep RTC alarm cadence and whether to align refreshes to solar-favorable hours
