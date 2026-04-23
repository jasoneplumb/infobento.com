# Power Budget

## Design Constraints

- **Form factor:** monolithic counter device. Front: color eInk display. Back-upper: solar panel. Back-lower: MCU + battery. No hinge, no MagSafe, no kickstand.
- **MCU:** ESP32-C3 or ESP32-C6 (decision in #35; C6 if Wi-Fi-direct, C3 if phone-bridged BLE)
- **Solar panel:** ~70×100 mm amorphous-Si on the upper portion of the back surface
- **Battery:** small rechargeable LiPo (~100 mAh target; reconfirm after panel pick)
- **Connectivity:** Wi-Fi direct (likely) — kills the iOS background-BLE risk that gated the previous clamshell concept. Phone-bridged BLE remains a fallback.

## Operating Profile

The device has a single power profile: counter-standing mode, refreshing 1–2× per day. There is no longer a phone-mounted minute-level mode (that died with the pivot away from MagSafe).

### Counter Mode

Solar panel exposed to indirect window light. Display facing the room. 1–2 refreshes per day.

| Component                   | Active | Sleep  | Duration                                           |
| --------------------------- | ------ | ------ | -------------------------------------------------- |
| Color eInk full refresh     | ~25 mA | 0 mA   | ~15–30 s (color panels are slower than monochrome) |
| Wi-Fi connect + fetch frame | ~70 mA | ~10 µA | ~10–20 s                                           |
| MCU active (during refresh) | ~5 mA  | ~10 µA | ~30 s                                              |

**Per refresh cycle:** ~45 s active, ~1.5–2.5 mAh total (color panels draw more per refresh than monochrome)

**Daily budget (2 refreshes):** ~3–5 mAh active + sleep ≈ ~3.5 mAh/day

This is higher than the dual-display clamshell's ~1 mAh/day budget — color refresh and Wi-Fi both cost more than monochrome refresh and BLE — but still well inside the solar harvest budget below.

## Power Sources

### Solar Harvesting (only)

Solar panel area is ~70×100 mm in the upper third of the back surface. In moderate indoor light (~200 lux through a typical window), generates roughly 5–15 mAh/day with the AEM10941 harvester. Daily margin (~2–11 mAh after the ~3.5 mAh refresh budget) covers:

- Cloudy days or shady placements
- Battery degradation over time
- Color-refresh cycle length variability

Direct sunlight through a south-facing window can push harvest to 30+ mAh/day; the design only needs sustained moderate indirect light to stay charged indefinitely.

### MagSafe Reverse Charging

**Removed.** No phone-mounted mode means no MagSafe Qi receiver. Removed from BOM and PCB.

## Open Questions

- Final battery capacity once panel is chosen (color refresh draws more — may want 150–200 mAh)
- Wi-Fi setup UX for first-time pairing (no buttons; QR code containing network credentials? captive portal? phone-app pairing?)
- Cold-start behavior when battery is fully depleted (especially in low-light placements)
- Refresh-time tolerance — if the device is in shade for a week, does it skip refreshes silently or surface a low-power state?
- Whether to use the MCU's deep-sleep RTC alarm (1–2× per day) or wake on Wi-Fi push from the cloud
