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

| Phase | Sketch                                           | Proves                                                                                                                                        | Status                      |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 0     | (server) `scripts/mint-device.ts`                | mint device, `/frame` returns 200                                                                                                             | ✅ done (PR #109)           |
| 1     | [`blink/`](blink/blink.ino)                      | toolchain + boot + serial, no panel                                                                                                           | ✅ bench-verified           |
| 2     | [`static-frame/`](static-frame/static-frame.ino) | framebuffer-translation path: native 2bpp → UC8179 two-plane upload (4-band gray ramp)                                                        | ✅ bench-verified           |
| 3     | [`device-pull/`](device-pull/device-pull.ino)    | Wi-Fi + `GET /api/device/<id>/frame` poll loop with `If-Modified-Since`/304 skip                                                              | ✅ bench-verified           |
| 4     | [`deep-sleep/`](deep-sleep/deep-sleep.ino)       | deep sleep + RTC wake; RTC-persisted `Last-Modified` so a 304 wake skips the refresh                                                          | ✅ bench-verified           |
| 5     | [`resilient/`](resilient/resilient.ino)          | resilience: graceful 404/429/5xx/Wi-Fi-fail handling, brownout recovery, clean draw-abort                                                     | ✅ bench-verified           |
| 6     | [`provisioning/`](provisioning/provisioning.ino) | captive-portal provisioning: AP-mode first boot, Wi-Fi scan/entry → NVS, OS auto-launch probes, pinhole factory reset → #39                   | ✅ bench-verified           |
| 7     | —                                                | port to production GDEH0576T81 + ESP32-C3 → #57                                                                                               | ⬜ (blocked on dev kit)     |
| ★     | [`orientation/`](orientation/orientation.ino)    | manual orientation toggle → #160: `GET /frames` caches BOTH orientations in LittleFS, green button (GPIO3, ext1) flips locally with Wi-Fi off | 🟡 drafted — awaiting bench |

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

Bench power snapshot (USB inline meter, 10 mA resolution — DROK VB26VA), board
level over USB:

- **304 wake** (no redraw): **≈ 80 mA for ~2 s** — the Wi-Fi blip — then sleep.
  ≈ 0.04 mAh per wake.
- **200 wake** (panel refresh): the Wi-Fi blip **plus** a **4.5 s draw at ≈ 60 mA
  sustained, peaking ≈ 150 mA** in the final ~1 s (last waveform phase / booster).
  ≈ 0.15 mAh per wake.
- **Deep sleep:** reads `0.00 A`, i.e. **< 10 mA** at the board level.

So the active side is cheap — even at a worst-case "redraw every wake," 1–2 wakes/
day is well under 1 mAh/day — and the daily budget is dominated entirely by the
sleep floor.

Still open: that floor is **below this meter's 10 mA resolution**, so the real
**single-digit-µA** figure remains unmeasured — the gap is decisive (≈50 µA →
~1 mAh/day vs a hidden ~10 mA → ~240 mAh/day). Capturing it needs a µA-grade
instrument on the **battery/supply line** (not USB): the reTerminal dev board
reads higher than the ~10 µA production target because of its always-on
peripherals + USB-UART bridge, so the definitive number is an ESP32-C3
measurement deferred to Phase 7.

**Phase 5 bench-verified on the E1001** (`IB_SLEEP_SECONDS` = 30 s bench cadence). A
live run walked all five cases on serial; in every failure case the panel kept its
last good frame and the device slept and recovered on its own:

- **API down** → `GET -> -1` → `keep last frame, retry next wake` → `deep sleep 30 s`;
  restarting the server → a later wake reconnects (`304 -> skip`).
- **Unprovisioned id** (config cleared in the DB) → `GET -> 404 ... unprovisioned ->
keep last frame`, no draw.
- **Wi-Fi failure** (bogus SSID) → `Wi-Fi FAILED -> keep last frame, retry next wake`,
  sleeps without hanging.
- **Rate limit** (device id hammered past 10/min) → `GET -> 429 -> honor Retry-After,
sleep 60 s` — note the **60 s** back-off, distinct from the normal 30 s.
- **Normal** (bumped `last_modified`) → exactly one `GET -> 200 ... drew frame`, then
  `304 -> skip` on the next wake (token committed to RTC only after the confirmed draw).

**Phase 5 bench check (operator).** Flash `resilient/` and force each failure — in
every case the panel must keep its last good frame (never blank/garble) and the
device must sleep and recover on its own:

- **API down:** stop the Hono server → `GET -> <negative>` → `keep last frame,
retry next wake` → `deep sleep`. Restart the server → a later wake draws normally.
- **Unprovisioned id:** point `secrets.h` at a device with no config (or clear it in
  the DB: `UPDATE devices SET config_json=NULL WHERE id=…`) → `GET -> 404 ...
unprovisioned` → sleep, no draw.
- **Wi-Fi failure:** break the **SSID** (point at a non-existent network) → `Wi-Fi
FAILED` → `keep last frame` → sleep (no hang, no crash). Note: breaking `WIFI_PASS`
  does **not** work on an **open** network — an open AP associates with any password
  string, so it would falsely "pass". Break the SSID (works on any network), or break
  the password only against a **WPA2** AP.
- **Rate limit:** hammer the device id past 10/min (e.g. burst `curl …/config` for it)
  → `GET -> 429 ... honor Retry-After, sleep 60 s`. The bucket is per-device-id and
  shared across `/config` + `/frame`, and refills 1 token/6 s, so sustain the burst
  across a wake.
- **Normal:** unchanged config still `304 -> skip`; a pushed config (or a bumped
  `last_modified`) still draws once then returns to 304 (token committed only after
  the confirmed draw).

**Phase 6 bench-verified on the E1001.** A live run walked the full out-of-box
flow on serial: first boot → `no creds -> AP mode, SSID 'InfoBento-C93F'` →
`captive portal up`; an iPhone auto-launched the setup page; scan + join saved
creds and rebooted into `provisioned=1`, which then rejoined silently
(`provisioned + online -> hand off to pull loop`). The pinhole factory reset,
wrong-password rejection, and unreachable-network AP fallback all behaved as
specified (see the checklist below). Two bench notes: the wrong-password path is
only meaningful against a **WPA2** network — an open AP (no auth) associates with
any password string, so test it with a password-protected 2.4 GHz hotspot (the
ESP32-S3 has no 5 GHz radio; on iPhone enable Personal Hotspot → Maximize
Compatibility to force 2.4 GHz). Use a separate device as the portal client — a
phone serving the hotspot can't simultaneously join the `InfoBento-XXXX` AP.

**Phase 6 bench check (operator).** Provisioning needs AP mode + a phone, so it
can't be CI-verified — flash `provisioning/` and walk the out-of-box flow. The
sketch has NO `secrets.h` (it has no creds to begin with). Watch serial at
115200:

- **First boot (no creds):** `no creds -> AP mode, SSID 'InfoBento-XXXX'` then
  `captive portal up`. A factory device must always land here.
- **Auto-launch:** join the open `InfoBento-XXXX` network from a phone/laptop —
  the OS should pop a browser straight onto the setup page (Apple
  `hotspot-detect.html`, Android `generate_204`, Windows `ncsi.txt` all 302 to
  the portal). If it doesn't auto-open, browse to `http://192.168.4.1`.
- **Scan + join:** the network dropdown is populated server-side (no JS). Pick
  your home Wi-Fi, type the password, **Connect** → `joining '<ssid>' ...` →
  `joined, IP …` → `provisioned -> creds saved` → the success page shows
  `infobento.com/onboard?device=<id>` → `rebooting into provisioned mode`.
- **Wrong password:** the portal must re-render with a retry banner and NOT
  persist the bad creds (`join FAILED`, no `creds saved`).
- **Returning boot (creds saved):** after the reboot, `provisioned=1` → it
  rejoins the saved network silently (`hand off to pull loop`), no AP. Move the
  device to an unreachable network → it falls back to AP mode for re-setup.
- **Pinhole reset:** ground the pinhole pin for 5 s →
  `PINHOLE 5s hold -> factory reset (clearing creds)` → reboot → back to AP
  mode. A momentary tap must NOT reset (the hold timer resets on release). On the
  E1001 the pinhole maps to **GPIO2** (expansion header J2 pin 4, one pin from
  GND on pin 2 — note the header is numbered in reverse of the silk/spec table);
  GPIO9 is the production-C3 pin but on the E1001 it is the panel SPI MOSI line.
- **Page budget:** the setup page is a few KB of inlined HTML/CSS, no JS, no
  external assets — comfortably inside the <30 KB-gzipped target.

`PINHOLE_GPIO` and the AP/NVS specifics are marked MCU-specific in the sketch for
the Phase 7 ESP32-C3 port. Production uses **GPIO9** (the C3 strapping pin with a
natural pull-up — the reason #39 picked it); the `IB_DEV_E1001` branch swaps in
**GPIO2** for bench bring-up because on the E1001 dev board GPIO9 is the panel SPI
MOSI line (and GPIO0/BOOT is tied to the USB-serial auto-reset), so neither can
serve as the pinhole there.

**Orientation toggle (`orientation/`, #160 / RFC 0002) — drafted, awaiting bench.**
Extends the Phase 4 deep-sleep pull: each network wake fetches BOTH orientations in
one `GET /api/device/<id>/frames` and stores them to a LittleFS partition; a green-
button press (GPIO3, ext1 deep-sleep wake) redraws the other cached orientation with
the radio off. The server delivers both frames in the panel's landscape raster
(portrait pre-rotated server-side, PR #164), so `uploadFrame` is orientation-agnostic.
The GPIO2 reset pinhole is untouched — a distinct input from the toggle button.

Flash with the 8 MB partition scheme **and declare `FlashSize=8M`** — the FQBN
defaults to 4 MB, which overflows the `default_8MB` table and boot-loops
(`partition N ... exceeds flash chip size 0x400000`). The E1001 is physically 32 MB;
Seeed's Arduino guidance is to select 8 MB. Then provide `orientation/secrets.h`
(gitignored, mirror `deep-sleep/`'s):

```
arduino-cli compile -u -p /dev/cu.usbserial-XXXX \
  --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200,FlashSize=8M,PartitionScheme=default_8MB' firmware/orientation
```

(Fallback if that ever boot-loops: drop `FlashSize` and use `PartitionScheme=default`
— the 4 MB scheme still carries a ~1.4 MB LittleFS partition, plenty for the ~192 KB
pair.)

**Orientation bench check (operator).** Watch serial at 115200:

- **First network wake (cold boot / timer):** `GET /frames -> 200` → `stored both
frames` → `drew frame` in landscape. A second wake within the window logs
  `304 -> keep cached frames, no redraw` (the Phase 4 power win still holds).
- **Button flip:** press the green button → `(green button)` wake, `flip landscape to
portrait`, `drew frame` — **with no `GET`** (radio stays off). Press again → flips
  back. Confirm the flip is ~one refresh, not a Wi-Fi cycle.
- **Orientation is up-right:** if portrait shows upside-down, flip the server-side
  rotation direction from `'cw'` to `'ccw'` in `getDeviceFramesForPull` (`device.ts`)
  — not a firmware change.
- **Empty store guard:** press the button before the first network wake ever ran →
  `no cached frame to flip to (empty store) -> no-op` (no garbage drawn).
- **Persistence across power loss:** flip to portrait, pull the battery/USB, repower →
  cold boot restores `portrait` from NVS (not silently back to landscape).
- **Reset pinhole unaffected:** the GPIO2 pinhole still factory-resets via the
  provisioning sketch; the toggle button (GPIO3) never clears creds.

MCU-specific for the Phase 7 ESP32-C3 port (#57): the green-button GPIO and the ext1
wake API (C3 uses `esp_deep_sleep_enable_gpio_wakeup`) are re-mapped; the toggle logic
is otherwise identical.

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
// LAN dev server (plain HTTP):
#define WIFI_SSID   "your-ssid"
#define WIFI_PASS   "your-pass"
#define IB_API_HOST "192.168.x.x"   // dev machine running the Hono API
#define IB_API_PORT "4000"
#define IB_DEVICE_ID "<id from `npm run mint -w @infobento/api`>"
#define IB_API_TLS  0               // deep-sleep only: 0 = http (LAN dev)
```

For the **production** server (`deep-sleep` sketch), keep the same `WIFI_SSID` /
`WIFI_PASS` as above and change the API fields to point at `www.infobento.com`
over HTTPS (mint the device id on the host — see `docs/DEPLOY.md`):

```c
#define WIFI_SSID   "your-ssid"     // same Wi-Fi creds as above — still required
#define WIFI_PASS   "your-pass"
#define IB_API_HOST "www.infobento.com"
#define IB_API_PORT "443"
#define IB_DEVICE_ID "<id minted on the prod host>"
// IB_API_TLS defaults to 1 (https) — omit, or set explicitly:
#define IB_API_TLS  1
```

`IB_API_TLS` is a build-time **switch**, not a statement about which sketches can
speak HTTPS. How each one chooses its transport:

| Sketch                      | Transport                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- |
| `deep-sleep`, `orientation` | `IB_API_TLS` macro, defaults to `1` (https); set `0` in `secrets.h` for LAN dev |
| `integrated`                | runtime — HTTPS iff the stored server URL starts with `https`                   |
| `device-pull`, `resilient`  | HTTP only, by design (LAN bench tools)                                          |

So three sketches can reach production over TLS, and none of them verifies the
certificate — see the warning below.

> ### ⚠️ These sketches do not verify TLS certificates
>
> Every sketch that speaks HTTPS — `deep-sleep`, `orientation`, `integrated` —
> calls `client.setInsecure()`, which disables certificate validation entirely.
> Combined with the fact that **the device id is a bearer secret carried in the
> URL path** (`/api/device/<device-id>/frames`), an attacker positioned between
> the device and the network — a hostile Wi-Fi access point, a compromised
> router, an ARP-spoofing neighbour — can present any certificate, read the
> device id, and from then on impersonate the device or pull its owner's
> rendered frames.
>
> This is acceptable for **bench work on a network you control**, which is all
> these sketches are currently used for. It is **not** acceptable for firmware
> shipped on hardware in other people's homes.
>
> Hardening is tracked in **#145**: pin the ISRG Root X1 CA via
> `client.setCACert(...)`, add an explicit `http.setTimeout()` so the TLS
> handshake has margin, and optionally persist the TLS session ticket in RTC
> memory across wakes. Anyone building on this firmware for real deployment
> should do that first.

`provisioning` is the **exception** — it has no `secrets.h` and needs none: the
whole point of captive-portal setup is that the device starts with no creds and
obtains them from the user, so it compiles and runs with nothing pre-baked.

`firmware/dev/` (also gitignored) holds bench helpers: `push-config.sh`,
`serial-boot.sh`, `config-e1001.json`, and captured `serial.log`.

## Forward plan

1. **Phase 4 — deep sleep + RTC.** ✅ bench-verified (`deep-sleep/`). The
   `loop()` `delay(IB_POLL_MS)` busy-wait is gone: the whole
   cycle runs in `setup()` and ends in `esp_deep_sleep_start()` for the
   `IB_SLEEP_SECONDS` build constant. `Last-Modified` persists across sleeps in
   RTC slow memory (`RTC_DATA_ATTR`), so a 304 wake returns to sleep without
   touching the panel. This is what makes the solar/battery budget real.
2. **Phase 5 — resilience.** ✅ bench-verified (`resilient/`). Every failure mode
   degrades gracefully: Wi-Fi down / wrong
   creds / 404 (unprovisioned) / 5xx / transport error → don't draw, sleep the
   normal cadence, retry next wake (eInk holds the last good frame for free, so no
   flash framebuffer cache is needed); 429 → honor `Retry-After`; brownout reset →
   skip the fetch and sleep a longer recovery interval. Two correctness fixes over
   Phase 4: `checkBusy` records a timeout so `drawFrame()` aborts cleanly on a stuck
   panel, and the cached `Last-Modified` is committed to RTC **only after a
   confirmed draw** (else a failed refresh would 304 the next wake and strand the
   panel on a frame that never rendered).
3. **Phase 6 — captive portal (#39).** ✅ bench-verified (`provisioning/`).
   AP mode on first boot, on-device no-JS setup
   page (server-side Wi-Fi scan → creds + optional custom server URL self-host
   hatch), NVS storage, OS auto-launch probes, and a GPIO9 pinhole factory
   reset. Creds persist only after a confirmed join, so a wrong password never
   strands un-joinable creds in NVS; a returning device with un-joinable saved
   creds falls back to AP for re-provisioning. The web-side "forget Wi-Fi"
   counterpart (`POST /api/device/:id/forget`, same effect as the pinhole) is
   the server half, merged separately (#39). This is the gate to a shippable
   out-of-box flow.
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
