# Power Budget

## Design Constraints

- **Form factor:** MagSafe clamshell — eInk display + solar panel connected by 180-degree hinge
- **Size:** Must fit on iPhone 15 Pro back (146.6 x 70.6mm)
- **MCU:** ESP32-C3 (RISC-V, BLE 5.0)
- **Solar panel:** One half of the clamshell, also serves as kickstand and display cover
- **Battery:** Small rechargeable LiPo with solar drip charger
- **MagSafe:** Passive reverse-charge from iPhone when collapsed on phone back
- **Connectivity:** BLE (Bluetooth Low Energy) via phone

## Operating Modes

The device has two power profiles depending on physical mode:

### Counter-Standing Mode (low power)

Solar panel aimed at window, display facing room. 1-2 refreshes per day.

| Component         | Active | Sleep | Duration    |
| ----------------- | ------ | ----- | ----------- |
| eInk full refresh | ~25 mA | 0 mA  | ~2 seconds  |
| BLE data transfer | ~15 mA | ~1 uA | ~5 seconds  |
| MCU active        | ~5 mA  | ~1 uA | ~10 seconds |

**Per refresh cycle:** ~17 seconds active, ~0.5 mAh total

**Daily budget (2 refreshes):** ~1 mAh active + ~0.05 mAh sleep = ~1.05 mAh/day

### Phone-Mounted Mode (higher power)

MagSafe-mounted on iPhone back. Minute-level partial refreshes for current data.

| Component            | Active | Sleep | Duration     |
| -------------------- | ------ | ----- | ------------ |
| eInk partial refresh | ~15 mA | 0 mA  | ~0.5 seconds |
| BLE data transfer    | ~15 mA | ~1 uA | ~3 seconds   |
| MCU active           | ~5 mA  | ~1 uA | ~5 seconds   |

**Per partial refresh:** ~8.5 seconds active, ~0.15 mAh total

**Hourly budget (1 refresh/min):** ~9 mAh/hour — significant, offset by MagSafe charging

## Power Sources

### Solar Harvesting (counter-standing mode)

Solar panel area constrained by clamshell half (~70 x 100mm usable). In moderate indoor light (~200 lux), generates roughly 5-15 mAh/day — well above the ~1 mAh daily requirement for counter mode. Margin covers:

- Cloudy days or low-light environments
- Battery degradation over time
- Transition periods between modes

### MagSafe Reverse Charging (phone-mounted / collapsed mode)

When collapsed on the iPhone or mounted on the back, the device can receive passive charge via MagSafe reverse charging. This offsets the higher power draw of phone-mounted mode's frequent refreshes.

## Open Questions

- Battery capacity target (50-150 mAh range)
- Solar panel efficiency at the constrained panel size
- Cold-start behavior when battery is fully depleted
- MagSafe reverse-charge power delivery rate (iPhone provides ~5W to accessories)
- Power budget feasibility for minute-level refresh in phone-mounted mode
- Whether phone-mounted mode should throttle refresh rate when battery is low
