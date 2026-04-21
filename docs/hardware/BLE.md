# Bluetooth Low Energy Protocol

## Overview

The device uses BLE to communicate with the user's phone. The phone acts as a bridge between the device and the cloud API — the device never connects to WiFi directly. The ESP32-C3 supports BLE 5.0.

In phone-mounted mode, the device stays connected or reconnects frequently for minute-level updates. In counter-standing mode, it follows the traditional wake-sync-sleep cycle.

## Connection Flow

### Counter-Standing Mode (1-2x per day)

1. **Device wakes** on RTC alarm (scheduled refresh time)
2. **Device advertises** BLE service for ~30 seconds
3. **Phone app** (or background service) detects advertisement and connects
4. **Phone** requests latest frame from cloud API via HTTPS
5. **Phone** transfers frame buffer to device via BLE
6. **Device** writes frame to eInk display
7. **Device** disconnects and returns to deep sleep

### Phone-Mounted Mode (minute-level)

1. **Device detects** MagSafe mount (proximity / charging state change)
2. **Device maintains** BLE connection or reconnects on short interval
3. **Phone** pushes updated frames as data changes (weather, calendar, messages)
4. **Device** performs partial eInk refresh
5. **Device** remains in low-power connected state (not deep sleep)

## Data Transfer

- **Frame size:** 6000 bytes (240x200 1-bit) — will change with final display resolution
- **BLE MTU:** ~244 bytes typical (negotiated; BLE 5.0 supports larger)
- **Packets needed:** ~25 packets
- **Transfer time:** ~2-3 seconds

## BLE Service Design

```
Service: InfoBento Display (UUID TBD)
├── Characteristic: Frame Data (write, notify)
│   Write chunked frame buffer data
├── Characteristic: Device Status (read, notify)
│   Battery level, last refresh time, error state, mount state
└── Characteristic: Config (read, write)
    Refresh schedule, device ID, operating mode
```

## Open Questions

- BLE 5.0 MTU negotiation strategy (ESP32-C3 supports it)
- Background BLE on iOS (restricted, needs careful handling — critical for phone-mounted mode)
- Compression for frame data (run-length encoding could reduce transfer size)
- Web Bluetooth for direct browser-to-device pairing (config only, not daily sync)
- How does the device detect it's in phone-mounted vs counter-standing mode?
- BLE connection interval tuning for phone-mounted mode (balance latency vs power)
