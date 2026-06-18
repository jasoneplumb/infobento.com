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

| Phase | Sketch                                           | Proves                                                                                    | Status                          |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------- |
| 0     | (server) `scripts/mint-device.ts`                | mint device, `/frame` returns 200                                                         | ✅ done (PR #109)               |
| 1     | [`blink/`](blink/blink.ino)                      | toolchain + boot + serial, no panel                                                       | ✅ bench-verified               |
| 2     | [`static-frame/`](static-frame/static-frame.ino) | framebuffer-translation path: native 2bpp → UC8179 two-plane upload (4-band gray ramp)    | ✅ bench-verified               |
| 3     | [`device-pull/`](device-pull/device-pull.ino)    | Wi-Fi + `GET /api/device/<id>/frame` poll loop with `If-Modified-Since`/304 skip          | ✅ bench-verified               |
| 4     | [`deep-sleep/`](deep-sleep/deep-sleep.ino)       | deep sleep + RTC wake; RTC-persisted `Last-Modified` so a 304 wake skips the refresh      | ✅ bench-verified               |
| 5     | [`resilient/`](resilient/resilient.ino)          | resilience: graceful 404/429/5xx/Wi-Fi-fail handling, brownout recovery, clean draw-abort | 🔄 compile-clean; bench-pending |
| 6     | —                                                | captive-portal provisioning (Wi-Fi creds + custom server URL) → #39                       | ⬜ next                         |
| 7     | —                                                | port to production GDEH0576T81 + ESP32-C3 → #57                                           | ⬜ (blocked on dev kit)         |

"Bench-verified" = run on real E1001 hardware. Phase 3 evidence lives in the
(gitignored) `dev/serial.log`: a live run shows `GET → 200`, `drew frame in
4486 ms`, then steady `304 → skip refresh`.

**Phase 4 bench-verified on the E1001** (`IB_SLEEP_SECONDS` = 30 s bench cadence).
A live run captured the full state machine on serial:

- each wake boots from deep sleep (`rst:0x5 (DSLEEP)`, `wake cause 4 (RTC timer)`)
  and the `boot #N` counter increments across sleeps — proving the RTC-persisted
  state (`RTC_DATA_ATTR`: boot counter + cached `Last-Modified`) survives;
- steady state (no server change): `GET -> 304 ... skip refresh` then straight
  back to `deep sleep` — **no `drew frame`, panel does not flash**;
- push a new config server-side → the next wake logs `GET -> 200`, the new
  `Last-Modified`, and `drew frame in 4486 ms`; the wake _after_ that returns to
  `304 -> skip`, confirming the new token was cached to RTC and the panel redraws
  exactly once per change.

To reproduce the 200-draw: `firmware/dev/push-config.sh <config> <device-id>`
(point `INFOBENTO_DB_PATH` at the DB the running API opened — `lsof` it if unsure).

Still open: the deep-sleep **floor current** between wakes is unmeasured. Meter
the battery/supply line (not USB) — the reTerminal dev board reads higher than the
~10 µA production target because of its always-on peripherals + USB-UART bridge, so
the real single-digit-µA figure is an ESP32-C3 measurement deferred to Phase 7.

**Phase 5 bench check (operator).** Flash `resilient/` and force each failure — in
every case the panel must keep its last good frame (never blank/garble) and the
device must sleep and recover on its own:

- **API down:** stop the Hono server → `GET -> <negative>` → `keep last frame,
retry next wake` → `deep sleep`. Restart the server → a later wake draws normally.
- **Unprovisioned id:** point `secrets.h` at a device with no config (or clear it)
  → `GET -> 404 ... unprovisioned` → sleep, no draw.
- **Wrong creds:** break `WIFI_PASS` → `Wi-Fi FAILED` → `keep last frame` → sleep
  (no hang, no crash).
- **Rate limit:** hammer the device id past 10/min → `GET -> 429 ... honor
Retry-After, sleep 60 s`.
- **Normal:** unchanged config still `304 -> skip`; a pushed config still draws once
  then returns to 304 (token committed only after the confirmed draw).

## Framebuffer translation (the key risk Phase 2 retired)

The renderer emits **native** 2bpp, MSB-first, 4px/byte, `0=white … 3=black`. The
UC8179 grayscale path wants `0=black … 3=white`. Because the packing is identical,
the per-pixel `3 - level` flip is exactly a per-byte bitwise NOT
(`0x00↔0xFF`, `0x55↔0xAA`) — see `drawFrame()`. The UC8179 driver (pins, LUTs,
init, two-plane upload, refresh, sleep) is vendored verbatim from Seeed's
`GxEPD2_reTerminal_E1001_Gray4` example, including its internal `3 - gray`
waveform-polarity inversion. Pin map: SCK 7, MOSI 9, CS 10, DC 11, RES 12, BUSY 13.

## Secrets & dev tooling (gitignored)

`device-pull` needs a `secrets.h` in its sketch dir —
`firmware/device-pull/secrets.h` (Arduino resolves `#include "secrets.h"`
relative to the `.ino`). Not committed; `firmware/**/secrets.h` is gitignored:

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

1. **Phase 4 — deep sleep + RTC.** ✅ bench-verified (`deep-sleep/`). The
   `loop()` `delay(IB_POLL_MS)` busy-wait is gone: the whole
   cycle runs in `setup()` and ends in `esp_deep_sleep_start()` for the
   `IB_SLEEP_SECONDS` build constant. `Last-Modified` persists across sleeps in
   RTC slow memory (`RTC_DATA_ATTR`), so a 304 wake returns to sleep without
   touching the panel. This is what makes the solar/battery budget real.
2. **Phase 5 — resilience.** 🔄 implemented (`resilient/`, compile-clean,
   bench-pending). Every failure mode degrades gracefully: Wi-Fi down / wrong
   creds / 404 (unprovisioned) / 5xx / transport error → don't draw, sleep the
   normal cadence, retry next wake (eInk holds the last good frame for free, so no
   flash framebuffer cache is needed); 429 → honor `Retry-After`; brownout reset →
   skip the fetch and sleep a longer recovery interval. Two correctness fixes over
   Phase 4: `checkBusy` records a timeout so `drawFrame()` aborts cleanly on a stuck
   panel, and the cached `Last-Modified` is committed to RTC **only after a
   confirmed draw** (else a failed refresh would 304 the next wake and strand the
   panel on a frame that never rendered).
3. **Phase 6 — captive portal (#39).** AP mode on first boot, on-device setup page
   for Wi-Fi creds + an optional custom server URL (self-host hatch), NVS storage,
   pinhole factory reset. This is the gate to a shippable out-of-box flow.
4. **Phase 7 — production hardware (#57).** Re-point pins/dimensions to GDEH0576T81
   (920×680, 156,400-byte frame) on ESP32-C3 once the dev kit arrives.

### Shared UC8179 driver — extraction deferred (decision)

The UC8179 driver (pins, 5 gray LUTs, `initGrayMode`/`uploadFrame`/`refresh`/
`sleep`) is still copy-pasted across `static-frame`, `device-pull`, `deep-sleep`,
and now `resilient` (5 copies). Phase 4 was the nominal time to extract it, but
**it stays vendored per-sketch on purpose**: Arduino's build model can't share a
header across sibling
sketch folders without breaking the documented zero-flag build. `arduino-cli
compile firmware/<sketch>` only sees the sketch dir (and its `src/` subfolder) plus
_installed_ libraries — a real shared header needs either a library + a
`--libraries firmware/libraries` flag (changes the build command everyone runs and
adds a library-management step that fights the "self-contained bench sketch"
philosophy) or a copy in each sketch's `src/` (not actually shared). The clean home
for this is a proper Arduino library when the firmware graduates from bench sketches
(Phase 6/7), where a real project layout earns the build-command change.
