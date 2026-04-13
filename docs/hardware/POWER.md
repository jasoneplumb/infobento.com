# Power Budget

## Design Constraints

- **Form factor:** Credit card sized (~85mm x 54mm)
- **Solar panel:** One side of the device (~45 cm² usable area)
- **Battery:** Small rechargeable LiPo
- **Refresh schedule:** 1-2x per day
- **Connectivity:** BLE (Bluetooth Low Energy) via phone

## Power Consumption Estimates

| Component         | Active | Sleep | Duration    |
| ----------------- | ------ | ----- | ----------- |
| eInk refresh      | ~25 mA | 0 mA  | ~2 seconds  |
| BLE data transfer | ~15 mA | ~1 uA | ~5 seconds  |
| MCU active        | ~5 mA  | ~1 uA | ~10 seconds |

**Per refresh cycle:** ~17 seconds active, ~0.5 mAh total

**Daily budget (2 refreshes):** ~1 mAh active + ~0.05 mAh sleep = ~1.05 mAh/day

## Solar Harvesting

A ~45 cm² solar panel in moderate indoor light (~200 lux) generates roughly 5-15 mAh/day, well above the ~1 mAh daily requirement. This provides margin for:

- Cloudy days or low-light environments
- Battery degradation over time
- Occasional extra BLE sessions

## Open Questions

- Battery capacity target (50-150 mAh range)
- Solar panel efficiency at indoor light levels
- Cold-start behavior when battery is fully depleted
