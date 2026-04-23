# Connectivity

## Status

The connectivity model is **pending decision** in #35 (panel + MCU sourcing). Two options on the table; the project is leaning Wi-Fi direct.

| Option                           | MCU      | Pro                                                                                                                           | Con                                                                                                                                                                             |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wi-Fi direct (likely)**        | ESP32-C6 | No phone dependency. Removes the iOS background-BLE risk that gated the previous concept. Standard HTTP fetch from cloud API. | Requires first-time Wi-Fi setup UX (no buttons on the device). Higher per-refresh power (~70 mA Wi-Fi vs ~15 mA BLE) — fine at 1–2 refreshes/day.                               |
| **Phone-bridged BLE (fallback)** | ESP32-C3 | Lower per-refresh power. Phone handles network. No Wi-Fi setup.                                                               | Requires a companion phone app and the user keeping it nearby. Even in counter mode, this is a real friction point now that the device is home-bound rather than phone-mounted. |

Once chosen in #35, this document will be replaced with a single protocol spec for the chosen option. Until then, the rest of this file is preserved for reference and may not reflect the final design.

---

## Wi-Fi Direct (likely path)

### Connection Flow (1–2× per day)

1. **Device wakes** on RTC alarm
2. **Device joins** the configured Wi-Fi network
3. **Device fetches** the latest frame from the cloud API via HTTPS (`GET /api/render?config=<id-or-hash>`)
4. **Device** writes the frame to the eInk display
5. **Device** disconnects Wi-Fi and returns to deep sleep

### Setup UX (open question)

The device has no buttons. First-time Wi-Fi setup options:

- **Captive portal:** device boots in AP mode, user joins its network from their phone, browser auto-launches a setup page
- **QR code from web editor:** user shows the device a QR code containing SSID + password (requires a camera — not a great fit for a counter device)
- **WPS button on router:** simple but few routers expose WPS anymore
- **Pre-provisioning:** user enters credentials in the web editor, exports a JSON, side-loads via USB during setup (clunky)

Captive portal is the leading candidate.

---

## Phone-Bridged BLE (fallback path)

If Wi-Fi-direct setup turns out to be too clunky for a calm-design device, BLE-via-phone-bridge stays viable in counter mode (much less risky than the abandoned phone-mounted mode, since the phone is just nearby in the kitchen rather than in a pocket all day).

### Connection Flow (1–2× per day)

1. **Device wakes** on RTC alarm
2. **Device advertises** BLE service for ~30 s
3. **Phone app** detects advertisement and connects (foreground or background-task)
4. **Phone** fetches the latest frame from cloud API via HTTPS
5. **Phone** transfers the frame buffer to device via BLE (chunked)
6. **Device** writes the frame and disconnects

### Data Transfer

- **Frame size:** depends on chosen panel and color depth — see `docs/hardware/DISPLAY.md`
- **BLE 5.0 MTU:** ~244 bytes typical
- **Transfer time:** seconds

---

## What's gone

The previous clamshell design had a separate phone-mounted mode that depended on **iOS background BLE** keeping the device fresh in the user's pocket all day. That risk killed the dual-display concept. With the counter-only pivot, neither path needs background BLE: Wi-Fi-direct skips the phone entirely, and BLE-bridge needs only foreground or short background-task connectivity 1–2× per day.
