# reTerminal E1001 — Hardware Setup Walkthrough

> _Companion to [FIRMWARE_BRINGUP.md](FIRMWARE_BRINGUP.md). Records the **actual,
> verified** bench setup for bringing up InfoBento firmware on the Seeed
> reTerminal E1001 (7.5" 800×480, ESP32-S3, 4-level grayscale). Commands here
> were run and confirmed on a macOS host — not theoretical._

## Bench facts (this rig)

| Thing                | Value                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Host                 | macOS (Apple Silicon)                                                                                                  |
| Device port          | `/dev/cu.usbserial-1430` — a **USB-UART bridge** (CP210x/CH34x class), _not_ native USB CDC (`cu.usbmodem`)            |
| Board profile (FQBN) | `esp32:esp32:esp32s3` ("ESP32S3 Dev Module") — no dedicated E1001 profile exists; this is what Seeed's own docs select |
| Toolchain            | `arduino-cli` 1.5.1 in `~/.local/bin`                                                                                  |
| ESP32 core           | `esp32:esp32` 3.3.8 (shared with the Arduino IDE via `~/Library/Arduino15`)                                            |
| eInk library         | `GxEPD2` 1.6.9 (+ `Adafruit GFX` 1.12.6 dependency)                                                                    |

## Gotchas (learned the hard way)

1. **Upload speed.** The default `921600` baud **fails** over this UART bridge —
   sync succeeds and the stub flasher runs, then "chip stopped responding" mid-write.
   Flash at **`115200`** instead: `--fqbn esp32:esp32:esp32s3:UploadSpeed=115200`.
2. **Serial routing.** With the esp32 core's default **`CDCOnBoot=Disabled`**,
   `Serial` goes to **UART0 → the bridge** (this `cu.usbserial` port). If you flip
   the board option to "USB CDC On Boot: Enabled", `Serial` moves to the native USB
   port (`cu.usbmodem*`) and your prints vanish from the bridge port.
3. **Don't `cat` the raw port to read serial.** A bare `cat /dev/cu.usbserial-*`
   holds **DTR/RTS asserted**, which on the ESP32-S3 auto-reset circuit can pin
   GPIO0 low and trap the chip in the ROM bootloader (no app output). Use
   `arduino-cli monitor` — it manages DTR/RTS so the app actually runs.
4. **The dev API binds loopback by default.** `npm run dev -w @infobento/api`
   listens on **`127.0.0.1:4000`**, so the device (on Wi-Fi) can't reach it and a
   LAN `curl http://<mac-ip>:4000/…` returns `000`. Start it with **`HOST=0.0.0.0`**
   to bind all interfaces: `HOST=0.0.0.0 npm run dev -w @infobento/api`. macOS may
   prompt to allow incoming connections for `node` — allow it. (The device must also
   be on the **same 2.4 GHz** SSID — the ESP32-S3 has no 5 GHz radio.)
5. **Point the API at the right DB.** The server opens
   `/var/lib/infobento/data.db` by default, but a bench device is usually minted into
   a local `dev.db`. If `/frame` returns `404` for a known-good device id, the API is
   on the wrong DB — start it with **`INFOBENTO_DB_PATH=…/dev.db`**. To confirm which
   device ids exist: `sqlite3 dev.db "SELECT id, CASE WHEN config_json IS NULL THEN
'no-config' ELSE 'ok' END FROM devices;"`.

## Phase 0 — prerequisites (host side) ✅

```bash
# arduino-cli (standalone, into a dir already on PATH)
mkdir -p ~/.local/bin
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
  | BINDIR="$HOME/.local/bin" sh

# ESP32 core (skip if the Arduino IDE already installed it — it's shared)
arduino-cli core list | grep esp32 || {
  arduino-cli config init
  arduino-cli config add board_manager.additional_urls \
    https://espressif.github.io/arduino-esp32/package_esp32_index.json
  arduino-cli core update-index
  arduino-cli core install esp32:esp32
}

# eInk library (+ Adafruit GFX pulled automatically)
arduino-cli lib install GxEPD2
```

## Phase 1 — toolchain + blink ✅ (serial verified)

Sketch: [`firmware/blink/blink.ino`](../../firmware/blink/blink.ino) — serial boot
banner + 1 Hz LED toggle + `alive #N` heartbeat.

```bash
cd <repo-root>
arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/blink
arduino-cli upload  -p /dev/cu.usbserial-1430 \
  --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/blink
arduino-cli monitor -p /dev/cu.usbserial-1430 -c baudrate=115200   # expect: alive #N (uptime Ns)
```

**Verified output:**

```
alive #85 (uptime 86s)
alive #86 (uptime 87s)
alive #87 (uptime 88s)
```

**Remaining for Phase 1:** confirm the onboard LED blinks (the `LED_BUILTIN`
GPIO is a guess on the generic profile — a wrong pin just means no visible LED,
serial is the real proof), then flash **Seeed's official reTerminal E1001 GxEPD2
example** to (a) draw _anything_ to the panel and (b) capture the **authoritative
driver class + SPI/BUSY/RST/DC pin map** — both are required before Phase 2.

> Do not guess the GxEPD2 driver class or pins. They must come from Seeed's
> example for this exact board; a wrong class smears or shows nothing.

## Panel facts (verified from Seeed's E1001 example)

| Thing        | Value                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel        | **GDEY075T7** (7.5", 800×480)                                                                                                                                          |
| Controller   | **UC8179**                                                                                                                                                             |
| GxEPD2 class | `GxEPD2_750_GDEY075T7`                                                                                                                                                 |
| Grayscale    | **4 levels — but only via Seeed's fork** (`Seeed_GxEPD2`, `initGrayMode(GRAY_LEVEL4)`, palette `TFT_GRAY_0..3`). Upstream GxEPD2 drives this class **1-bit B/W only**. |
| SPI pins     | `SCK=7  MOSI/DIN=9  CS=10  DC=11  RST=12  BUSY=13` (no power-enable pin)                                                                                               |

> **Course-correction vs project docs.** `CLAUDE.md` + `FIRMWARE_BRINGUP.md` state
> the E1001 is "4-level grayscale, maps 1:1 onto the renderer's 2-bit output."
> That is achievable **only on Seeed's fork** — stock upstream GxEPD2 would flatten
> our 4 levels to black/white. The 1:1 mapping the design assumes requires
> `Seeed_GxEPD2` (or `Seeed_GFX`) grayscale mode, not the `GxEPD2` library installed
> in Phase 0.

## Display library — committed path

- **Library:** `Seeed_GxEPD2` fork (`github.com/Seeed-Projects/Seeed_GxEPD2`),
  cloned into `~/Documents/Arduino/libraries/Seeed_GxEPD2`. It self-identifies as
  `name=GxEPD2 version=1.6.9`, so **uninstall upstream GxEPD2 first** or they collide.
- **Grayscale demo:** `examples/GxEPD2_reTerminal_E1001_Gray4` — flashed + verified
  compiling/uploading. Draws a 4-level test image once at boot (`loop(){}` idles).
  **✅ Panel confirmed showing 4 distinct gray shades** — Phase 1 complete; the
  grayscale LUT + two-bit-plane path is proven working on hardware.

```bash
arduino-cli lib uninstall GxEPD2                       # remove upstream
git clone --depth 1 https://github.com/Seeed-Projects/Seeed_GxEPD2.git \
  ~/Documents/Arduino/libraries/Seeed_GxEPD2
EX=~/Documents/Arduino/libraries/Seeed_GxEPD2/examples/GxEPD2_reTerminal_E1001_Gray4
arduino-cli compile --fqbn esp32:esp32:esp32s3 "$EX"
arduino-cli upload -p /dev/cu.usbserial-1430 --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' "$EX"
```

## Phase 2 — framebuffer translation reference (the high-risk step, de-risked)

The Gray4 example **is** the translation spec. Findings to carry into InfoBento firmware:

- **Canvas:** 2bpp, `800×480/4 = 96,000` bytes — **byte-for-byte the same size** as
  the renderer's output (`packages/core/src/constants.ts`: `ceil(w/4)*h`).
- **Gray mapping — INVERTED, must remap.** Renderer (`packages/renderer/src/draw.ts:23`)
  is `0=white 1=light 2=dark 3=black`; the panel is `0=black 1=dark 2=light 3=white`.
  They are flipped → the unpacker MUST apply **`panel_level = 3 − renderer_level`**
  (0↔3, 1↔2), else the image renders as a photo-negative.
- **Source pixel extraction:** 2bpp **MSB-first** — pixel 0 of each byte is in bits 7-6.
  For pixel x: `byteIndex = y*ceil(w/4) + (x>>2)`, `shift = (3 − (x & 3)) * 2`,
  `level = (byte >> shift) & 0x03`. (Matches `setPixel`/`getPixel` in `draw.ts`.)
- **Encoding:** UC8179 grayscale wants **two bit-planes**, packed per Seeed_GFX's
  `EPD_PUSH_NEW_GRAY_COLORS` truth table — **not** a naive MSB/LSB split. The example
  carries the verified table + the VCOM/WW/KW/WK/KK LUTs verbatim. Phase 2 = feed our
  framebuffer through this same plane-packing instead of the demo's drawn canvas.
- **SPI:** HSPI, `hspi.begin(EPD_SCK=7, -1, EPD_MOSI=9, -1)`, manual CS/DC/RST/BUSY.

## Phase 2 — IMPLEMENTED + flashed (`firmware/static-frame/`)

A self-contained sketch pushes an InfoBento-native frame to the panel:

- `firmware/static-frame/ramp_frame.h` — a 4-band vertical gray ramp generated in
  the renderer's exact 2bpp format (gen step embedded in the walkthrough history).
- `firmware/static-frame/static-frame.ino` — vendors Seeed's UC8179 driver (LUTs,
  init, two-plane upload **with its internal `3 - gray` waveform inversion kept**)
  and adds the InfoBento→panel convention flip.

**Translation, distilled:** renderer (`0=white..3=black`) → panel canvas
(`0=black..3=white`) is a per-pixel `3 − level` flip. Because both buffers are
identical 2bpp MSB-first layouts, that flip is exactly **a per-byte bitwise NOT**
(`canvas[i] = ~IB[i]`; `0x00↔0xFF`, `0x55↔0xAA`). The vendored upload then applies
its own polarity inversion for the panel waveform — two distinct, both-necessary
transforms.

**Verified serial trace** (full boot caught via DTR/RTS reset):

```
[IB] Translated 96000 bytes
[IB] UC8179 gray mode init done
[IB] Frame uploaded (2 bit planes)
[IB] Refresh 3610 ms        <- full 4-gray refresh ~3.6 s (Phase 4 power input)
[IB] Done. Expect 4 bands L->R: WHITE LIGHT DARK BLACK
```

**✅ Panel confirmed: 4 clean bands WHITE→LIGHT→DARK→BLACK (correct order).**
Framebuffer-translation risk (the plan's highest-uncertainty item) is **closed**.

### Serial tooling (use for Phases 3–6)

Two readers, **never both at once** (the port is exclusive — they'll fight over it):

- **Steady-state loop** (`200`/`304` pulls): `arduino-cli monitor -p <PORT> -c baudrate=115200`.
  Zero setup, manages DTR/RTS correctly. But it attaches _after_ the post-flash
  reset, so it **misses one-shot boot prints** (Wi-Fi connect, panic backtraces,
  early `setup()` failures).

- **Boot + loop** (debug a crash-on-boot or Wi-Fi failure): open the port _first_,
  pulse RTS(EN) to reset into the app, then read forever. Captures boot **and**
  every subsequent pull. One-time venv (system pip is PEP-668 blocked):

  ```bash
  python3 -m venv ~/.venvs/ibserial && ~/.venvs/ibserial/bin/pip install pyserial
  firmware/dev/serial-boot.sh                 # auto-detects /dev/cu.usbserial*, tees to firmware/dev/serial.log
  firmware/dev/serial-boot.sh /dev/cu.usbserial-1430 115200   # or pass port/baud explicitly
  ```

  `firmware/dev/serial-boot.sh` is a local bench helper (gitignored, like the rest
  of `firmware/dev/`). It resets the board on every run, so it's a debugging tool —
  for passive observation of a running device, prefer `arduino-cli monitor`.

## Phase 3 — Wi-Fi + device-pull loop ✅ (flashed + verified on hardware)

**Host side (all verified):**

- API binds loopback by default — must export **`HOST=0.0.0.0`** so the device can
  reach it on the LAN. Also `INFOBENTO_DB_PATH` must match between mint + server.
- Renderer honors `config.width`/`config.height`, so a device minted with an
  **800×480** config yields a 96,000-byte landscape frame (`X-Frame-Width: 800`).

```bash
# 800x480 config = reference config + dimensions
node -e "const c=require('./docs/reference/infobento-config.json');c.width=800;c.height=480;require('fs').writeFileSync('firmware/dev/config-e1001.json',JSON.stringify(c,null,2))"
export INFOBENTO_DB_PATH=~/.infobento/dev.db
npx tsx scripts/mint-device.ts --db "$INFOBENTO_DB_PATH" --config firmware/dev/config-e1001.json   # -> device id
HOST=0.0.0.0 npm run dev -w @infobento/api    # serves on 0.0.0.0:4000
# verify from the device's vantage point:
curl -sI "http://192.168.1.150:4000/api/device/<id>/frame?orientation=landscape"   # 200, x-frame-width:800
```

Verified: LAN fetch → `200, content-length 96000, x-frame-width 800`; repeat with
`If-Modified-Since` → `304`.

**Firmware:** `firmware/device-pull/device-pull.ino` — Wi-Fi connect, poll loop
(`IB_POLL_MS=15s`), `If-Modified-Since` caching, draw on 200 / skip on 304. Reuses
the vendored UC8179 path. Secrets live in **`firmware/secrets.h`** (gitignored;
device id + API host pre-filled, Wi-Fi creds blank).

> **Build note:** `secrets.h` sits in `firmware/`, not the sketch dir, so compile
> with `--build-property "compiler.cpp.extra_flags=-I<repo>/firmware"`:
>
> ```bash
> arduino-cli compile --fqbn esp32:esp32:esp32s3 \
>   --build-property "compiler.cpp.extra_flags=-I$PWD/firmware" firmware/device-pull
> # upload takes NO --build-property (compile-only flag); it just flashes the built binary:
> arduino-cli upload -p /dev/cu.usbserial-1430 \
>   --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/device-pull
> ```

**✅ Verified on hardware (2026-06-15):** flashed via `arduino-cli upload` (hash
verified), reTerminal joined Wi-Fi and reached the LAN API. Full cycle observed on
serial: steady `304 → skip refresh`, then after bumping the device's `last_modified`
a `200 → frame OK → drew frame in 4486 ms` (full 4-gray eInk redraw), settling back
to `304`. Wi-Fi join, `200`-draw, and `If-Modified-Since` → `304`-skip paths all
confirmed end-to-end.

## Phase 4+ — _to be filled in as we go_
