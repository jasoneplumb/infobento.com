# InfoBento firmware (bench bring-up)

Dev-first firmware for epic #106. These are **bench sketches**, not a structured
firmware project yet — each is a single self-contained Arduino `.ino` that proves
one capability on the dev hardware before the next builds on it.

- **Dev board:** Seeed reTerminal E1001 — ESP32-S3, 7.5" 800×480 grayscale panel
  driven by a UC8179 controller.
- **Production target (not yet sourced):** GDEH0576T81 5.76" 920×680 + ESP32-C3,
  gated on the dev-kit order (#57). Phase 7 ports to it.

The reTerminal maps 1:1 onto the renderer's 2-bit output and hits the **identical**
cloud endpoints, so everything proven here ports directly to production.

## Toolchain

[`arduino-cli`](https://arduino.github.io/arduino-cli/) with the `esp32` core.
All sketches build for `esp32:esp32:esp32s3` (ESP32S3 Dev Module).

```bash
arduino-cli core install esp32:esp32
arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/<sketch>
arduino-cli upload  -p /dev/cu.usbserial-XXXX --fqbn esp32:esp32:esp32s3 firmware/<sketch>
arduino-cli monitor -p /dev/cu.usbserial-XXXX -c baudrate=115200
```

Serial routes to UART0 (the onboard USB-UART bridge, `/dev/cu.usbserial-*`) because
the core's `USB CDC On Boot` defaults to Disabled. If you enable CDC-on-boot, Serial
moves to the native USB port (`/dev/cu.usbmodem*`) and bridge-port prints vanish.

## Phase status

| Phase | Sketch                                           | Proves                                                                                 | Status                  |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------- |
| 0     | (server) `scripts/mint-device.ts`                | mint device, `/frame` returns 200                                                      | ✅ done (PR #109)       |
| 1     | [`blink/`](blink/blink.ino)                      | toolchain + boot + serial, no panel                                                    | ✅ bench-verified       |
| 2     | [`static-frame/`](static-frame/static-frame.ino) | framebuffer-translation path: native 2bpp → UC8179 two-plane upload (4-band gray ramp) | ✅ bench-verified       |
| 3     | [`device-pull/`](device-pull/device-pull.ino)    | Wi-Fi + `GET /api/device/<id>/frame` poll loop with `If-Modified-Since`/304 skip       | ✅ bench-verified       |
| 4     | —                                                | deep sleep + RTC wake (1–2 refreshes/day power budget)                                 | ⬜ next                 |
| 5     | —                                                | resilience: retry/backoff, brownout, partial-frame guards                              | ⬜                      |
| 6     | —                                                | captive-portal provisioning (Wi-Fi creds + custom server URL) → #39                    | ⬜                      |
| 7     | —                                                | port to production GDEH0576T81 + ESP32-C3 → #57                                        | ⬜ (blocked on dev kit) |

"Bench-verified" = run on real E1001 hardware. Phase 3 evidence lives in the
(gitignored) `dev/serial.log`: a live run shows `GET → 200`, `drew frame in
4486 ms`, then steady `304 → skip refresh`.

## Framebuffer translation (the key risk Phase 2 retired)

The renderer emits **native** 2bpp, MSB-first, 4px/byte, `0=white … 3=black`. The
UC8179 grayscale path wants `0=black … 3=white`. Because the packing is identical,
the per-pixel `3 - level` flip is exactly a per-byte bitwise NOT
(`0x00↔0xFF`, `0x55↔0xAA`) — see `drawFrame()`. The UC8179 driver (pins, LUTs,
init, two-plane upload, refresh, sleep) is vendored verbatim from Seeed's
`GxEPD2_reTerminal_E1001_Gray4` example, including its internal `3 - gray`
waveform-polarity inversion. Pin map: SCK 7, MOSI 9, CS 10, DC 11, RES 12, BUSY 13.

## Secrets & dev tooling (gitignored)

`device-pull` needs `firmware/secrets.h` (not committed — see root `.gitignore`):

```c
#define WIFI_SSID   "your-ssid"
#define WIFI_PASS   "your-pass"
#define IB_API_HOST "192.168.x.x"   // dev machine running the Hono API
#define IB_API_PORT "4000"
#define IB_DEVICE_ID "<id from mint-device.ts>"
```

`firmware/dev/` (also gitignored) holds bench helpers: `push-config.sh`,
`serial-boot.sh`, `config-e1001.json`, and captured `serial.log`.

## Forward plan

1. **Phase 4 — deep sleep + RTC.** Replace the `loop()` `delay(IB_POLL_MS)` with
   `esp_deep_sleep`; persist `Last-Modified` across sleeps in RTC memory so a wake
   that gets 304 never refreshes the panel. This is what makes the solar/battery
   budget real.
2. **Phase 5 — resilience.** Wi-Fi retry/backoff, HTTP timeout handling beyond the
   current `readExact` guard, brownout detection, and refusing to push a
   short/garbled frame to the panel.
3. **Phase 6 — captive portal (#39).** AP mode on first boot, on-device setup page
   for Wi-Fi creds + an optional custom server URL (self-host hatch), NVS storage,
   pinhole factory reset. This is the gate to a shippable out-of-box flow.
4. **Phase 7 — production hardware (#57).** Re-point pins/dimensions to GDEH0576T81
   (920×680, 156,400-byte frame) on ESP32-C3 once the dev kit arrives.

Shared-library extraction (the duplicated UC8179 driver across `static-frame` and
`device-pull`) should happen when the firmware graduates from bench sketches —
likely alongside Phase 4.
