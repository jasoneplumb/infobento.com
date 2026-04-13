# Bluetooth Low Energy Protocol

## Overview

The device uses BLE to communicate with the user's phone. The phone acts as a bridge between the device and the cloud API — the device never connects to WiFi directly.

## Connection Flow

1. **Device wakes** on RTC alarm (scheduled refresh time)
2. **Device advertises** BLE service for ~30 seconds
3. **Phone app** (or background service) detects advertisement and connects
4. **Phone** requests latest frame from cloud API via HTTPS
5. **Phone** transfers frame buffer to device via BLE
6. **Device** writes frame to eInk display
7. **Device** disconnects and returns to deep sleep

## Data Transfer

- **Frame size:** 6000 bytes (240x200 1-bit)
- **BLE MTU:** ~244 bytes typical (negotiated)
- **Packets needed:** ~25 packets
- **Transfer time:** ~2-3 seconds

## BLE Service Design

```
Service: InfoBento Display (UUID TBD)
├── Characteristic: Frame Data (write, notify)
│   Write chunked frame buffer data
├── Characteristic: Device Status (read, notify)
│   Battery level, last refresh time, error state
└── Characteristic: Config (read, write)
    Refresh schedule, device ID
```

## Open Questions

- BLE 4.2 vs 5.0 (5.0 has larger MTU, faster transfer)
- Background BLE on iOS (restricted, needs careful handling)
- Compression for frame data (run-length encoding could reduce transfer size)
- Web Bluetooth for direct browser-to-device pairing (config only, not daily sync)
