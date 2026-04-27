# Power Budget

## Design Constraints

- **Form factor:** monolithic counter device. Front: B&W eInk display. Back-upper: solar panel. Back-lower: MCU + battery. No hinge, no MagSafe, no kickstand.
- **MCU:** ESP32-C3 (Wi-Fi 4 + BLE 5; BLE radio reserved for v2)
- **Solar panel:** ~70×100 mm amorphous-Si on the upper portion of the back surface
- **Battery:** small rechargeable LiPo (~100 mAh target; reconfirm after panel pick)
- **Connectivity:** Wi-Fi direct (locked 2026-04-22 — see `docs/hardware/CONNECTIVITY.md`). Kills the iOS background-BLE risk; no companion app for v1.

## Operating Profile

The device has a single power profile: counter-standing mode, refreshing 1–2× per day. There is no longer a phone-mounted minute-level mode (that died with the pivot away from MagSafe).

### Counter Mode

Solar panel exposed to indirect window light. Display facing the room. 1–2 refreshes per day.

| Component                                       | Active | Sleep  | Duration                  |
| ----------------------------------------------- | ------ | ------ | ------------------------- |
| B&W eInk full refresh                           | ~25 mA | 0 mA   | ~0.75 s (partial: ~0.3 s) |
| Wi-Fi connect + fetch frame                     | ~70 mA | ~10 µA | ~10–20 s                  |
| MCU active (during refresh)                     | ~5 mA  | ~10 µA | ~15 s                     |
| Tilt switches (2× ball-in-tube, GPIO interrupt) | 0 mA   | 0 mA   | event-driven              |

**Per refresh cycle:** ~15–20 s active, ~0.8–1.2 mAh total

**Daily budget (2 refreshes):** ~2–3 mAh active + sleep ≈ ~2.5 mAh/day

Wi-Fi is the dominant power cost per refresh cycle. The B&W eInk refresh itself is sub-second and negligible. Wi-Fi is needed for every refresh (server-side rendering), not just data fetching — the device sends config to the cloud API and receives the rendered framebuffer back. Daily budget is well inside the solar harvest budget below.

## Power Sources

### Solar Harvesting (only)

Solar panel area is ~70×100 mm in the upper third of the back surface. In moderate indoor light (~200 lux through a typical window), generates roughly 5–15 mAh/day with the AEM10941 harvester. Daily margin (~2.5–12.5 mAh after the ~2.5 mAh refresh budget) covers:

- Cloudy days or shady placements
- Battery degradation over time

Direct sunlight through a south-facing window can push harvest to 30+ mAh/day; the design only needs sustained moderate indirect light to stay charged indefinitely.

### MagSafe Reverse Charging

**Removed.** No phone-mounted mode means no MagSafe Qi receiver. Removed from BOM and PCB.

## Open Questions

- Final battery capacity (100 mAh target; confirm after thermal testing)
- Wi-Fi setup UX for first-time pairing (no buttons; QR code containing network credentials? captive portal? phone-app pairing?)
- Cold-start behavior when battery is fully depleted (especially in low-light placements)
- Refresh-time tolerance — if the device is in shade for a week, does it skip refreshes silently or surface a low-power state?
- Whether to use the MCU's deep-sleep RTC alarm (1–2× per day) or wake on Wi-Fi push from the cloud
