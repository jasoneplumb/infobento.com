# RFC 0002 — Manual orientation toggle on the E1001 (cache both frames, redraw locally)

|                          |                                                                            |
| ------------------------ | -------------------------------------------------------------------------- |
| **Status**               | Draft                                                                      |
| **Issue**                | [#160](https://github.com/jasoneplumb/infobento.com/issues/160)            |
| **Author**               | jasoneplumb                                                                |
| **Created**              | 2026-06-30                                                                 |
| **Supersedes / relates** | shared enabler for auto-rotate #49; tilt hardware #48; Phase 7 C3 port #57 |

## Summary

On the E1001 test device, let the user **flip display orientation locally** —
landscape ⇄ portrait — by redrawing a **cached** frame, with **no network round
trip**. Each scheduled (network) wake fetches **both** orientation framebuffers
and persists them to flash; a manual trigger then wakes the device, reads the
_other_ orientation from flash, and refreshes the panel. The cloud render
pipeline is essentially unchanged; the work is one new combined raw endpoint, a
flash-backed frame store on the device, a button wake source, and a
redraw-from-flash path. The "cache both frames + redraw locally" machinery is a
deliberate **shared enabler** for the tilt-driven auto-rotate in #49.

## Decisions

| #   | Question             | Recommendation                                                                                                                                                                                                                                      |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Both-frames delivery | **New combined `GET /api/device/:id/frames`** returning both raw buffers in one response. The frame handler already renders both orientations; two `/frame` calls double the render, hydration, TLS, and rate-token cost for nothing.               |
| 2   | Storage across sleep | Persist both raw frames in a **LittleFS data partition** (`/orient/frames.bin`, 2× the panel frame). Written **only on a network wake** (1–2×/day) → wear is decades; read on a button wake.                                                        |
| 3   | Manual trigger input | For the E1001 prototype, **reuse the recessed pinhole (GPIO2) with press-duration discrimination** — short tap = orientation toggle, ≥5 s hold = existing factory reset. A dedicated button is the production path, deferred to SCAD #50 / Phase 7. |
| 4   | Wake source          | **ext1 deep-sleep wake** on the pinhole GPIO (idle-HIGH → `ESP_EXT1_WAKEUP_ANY_LOW`), alongside the existing RTC-timer wake; on a button wake, redraw the other cached orientation from flash with the radio off.                                   |

MCU-specific items (ext1 → C3 GPIO-wake API; GPIO2 → GPIO9 pinhole) are marked
for the Phase 7 ESP32-C3 port (#57), mirroring the existing GPIO2-vs-GPIO9
pinhole split documented in `firmware/provisioning/provisioning.ino`.

## Motivation

`renderBoth` (`packages/renderer/src/index.ts:366`) already produces a
landscape **and** a portrait `FrameBuffer` from one config, and
`getDeviceFrameForPull` (`packages/api/src/device.ts:126`) already calls it on
every 200 wake, then **discards one** orientation
(`device.ts:169` — `orientation === 'portrait' ? dual.portrait : dual.landscape`).
So the server is already paying to render both; the device just never receives
the unused half.

Today's firmware (`firmware/deep-sleep/deep-sleep.ino`) fetches a single
orientation (`?orientation=landscape`, line 261), draws it, and deep-sleeps.
Heap/RAM — including the 96 KB framebuffer — is cleared on deep sleep; only
`RTC_DATA_ATTR` survives, and RTC slow memory (8 KB on the S3) cannot hold a
frame. To flip orientation on a button wake **without** re-fetching, the second
frame must already be on the device, in non-volatile storage. That is the whole
problem this RFC solves.

## Goals

- A manual trigger flips landscape ⇄ portrait by redrawing a cached frame, **Wi-Fi
  off**, in roughly one eInk refresh time (~0.3–0.75 s).
- Each network wake delivers both frames in **one** request (one rate token, one
  hydration, one TLS handshake), preserving the 1–2×/day solar/battery budget.
- The 304-skip power win (RFC 0001 §4) is preserved unchanged.
- The persistence + redraw machinery is reusable by #49 (auto-rotate) with only a
  different _trigger_.

## Non-goals

- Web-side toggle persistence (which orientation a device "prefers" across config
  edits) — explicitly out of scope per the issue; separate issue.
- Full 4-orientation auto-rotate and tilt hardware (#49 / #48) — this RFC is the
  **manual** trigger and the shared enabler only.
- A production dedicated button + the enclosure hole for it (SCAD #50 / Phase 7).
- Changing the eInk cadence or the deep-sleep/RTC model.

## Question 1 — Both-frames delivery

**Recommendation: add a new combined raw endpoint `GET /api/device/:id/frames`**
returning both framebuffers in one response. Keep the existing single-orientation
`GET /api/device/:id/frame?orientation=` for the web editor and backward compat.

### Why not two `/frame` requests (option a)

It needs no API change, but it is the wrong tradeoff on a once-or-twice-daily
power budget:

- **Doubles the server-side work.** Each `/frame` call runs the full
  `hydrateConfig → renderBoth` pipeline (`device.ts:154–168`) and throws away one
  orientation. Two calls = two hydrations (2× upstream provider load, the exact
  thing RFC 0001's cache exists to avoid) and two dual renders.
- **Two rate tokens.** `GET /api/device/:id/frame` calls `consumeToken(id)`
  (`server.ts:480`); two requests per wake double the device's rate-limit
  footprint.
- **Two TLS handshakes + two HTTP round trips.** Wi-Fi active time dominates the
  per-wake energy (`docs/hardware/POWER.md`: ~70 mA for ~10–20 s, full TLS
  handshake every wake since deep sleep clears the session). Doubling the network
  phase is the most expensive way to get the second frame.
- **Two-step 304 reasoning.** Conditional-GET gating would have to agree across
  two independent requests.

`POST /api/preview?dual=1` (`server.ts:128`) is **not** a candidate: it returns
base64-encoded **PNG** for the web editor (`generateDualPreview`), not raw 2bpp
framebuffers, and it is a `POST` that carries the full config in the body. Same
for `POST /api/render-dual` (`server.ts:145`) — base64 JSON, validated, no
device auth via the bearer-id URL, no `Last-Modified`/304 gating. Neither suits a
deep-sleep device.

### Wire format / API contract for `/frames`

The handler mirrors `getDeviceFrameForPull` exactly, except it returns **both**
buffers instead of selecting one. It reuses the same device lookup, rate token,
`effectiveLastModified` 304 gate, `hydrateConfig`, and `renderBoth` — so the new
code is thin and the freshness semantics are identical to `/frame`.

- **Method/path:** `GET /api/device/:id/frames` (bearer id in the URL, like
  `/frame`).
- **304 gating:** identical to `/frame` — `If-Modified-Since` vs
  `effectiveLastModified(device, now)` (`device.ts:87`), evaluated **before**
  parse/hydrate so a skip stays allocation-free. A 304 returns no body; the
  device keeps both cached frames.
- **200 body:** the two raw buffers **concatenated, landscape first, then
  portrait**, `Content-Type: application/octet-stream`. For the E1001
  (800×480) that is `96000 + 96000 = 192000` bytes; for the production
  GDEH0576T81 (920×680) it is `156400 + 156400 = 312800` bytes.
- **Headers** (so the device can split the body without assuming the two halves
  are equal — they are equal for these panels, but the contract should not bake
  that in):
  - `Content-Length: <landscapeLen + portraitLen>`
  - `X-Frame-Landscape-Width`, `X-Frame-Landscape-Height`,
    `X-Frame-Landscape-Bytes`
  - `X-Frame-Portrait-Width`, `X-Frame-Portrait-Height`,
    `X-Frame-Portrait-Bytes`
  - `Last-Modified`, `X-Refresh-Interval`, `X-Device-Forget` — carried through
    unchanged from the `/frame` path (`server.ts:496–505`).

The device reads `X-Frame-Landscape-Bytes` of landscape, then
`X-Frame-Portrait-Bytes` of portrait, validating each against the expected
`w*h/4` exactly as `deep-sleep.ino` already validates a single frame
(`deep-sleep.ino:291`). On a size mismatch it skips the write (keeps the prior
cached pair), matching the existing "bad size → skip draw" guard.

> Design-only sketch of the server handler (not to be implemented in this RFC):
>
> ```ts
> // analogous to getDeviceFrameForPull, returns both buffers
> export async function getDeviceFramesForPull(...): Promise<DeviceFramesResult> {
>   // ... same 404 / 304 / parse / hydrate guards ...
>   const dual = renderBoth(hydrated);
>   return { status: 200, landscape: dual.landscape, portrait: dual.portrait,
>            lastModifiedMs: effectiveMs, refreshIntervalSec };
> }
> ```

## Question 2 — Storage across deep sleep

**Recommendation: persist both raw frames in a LittleFS data partition**, written
**only on a network (timer) wake**, read on a button wake.

### Why flash, and why a filesystem

- RAM/PSRAM is cleared on deep sleep; RTC slow memory is 8 KB on the ESP32-S3 —
  three orders of magnitude too small for one 96 KB frame, let alone two. The
  issue's premise (flash is the only option) is correct.
- The provisioning sketch already uses **NVS** (`Preferences`,
  `provisioning.ino:91`) for small key/values. NVS is the wrong store for ~192 KB
  blobs — it is a key/value page store tuned for small entries. Use a separate
  **LittleFS** data partition for the frame blobs; keep NVS for creds and small
  state. LittleFS gives wear-leveling and a trivial file API
  (`/orient/frames.bin`, or two files `/orient/landscape.bin` +
  `/orient/portrait.bin`).
- A tiny persisted **`currentOrientation`** flag (which frame is on the panel
  now) lives in `RTC_DATA_ATTR` (survives deep sleep, free) with an NVS mirror for
  the cold-boot/brown-out case. On a button wake the device redraws
  `other(currentOrientation)` and flips the flag.

### Flash budget

- E1001 frame pair: **~192 KB**. Production GDEH0576T81 pair: **~313 KB**
  (920×680, the 156,400-byte frame from `DISPLAY.md`/`constants.ts`). Size the
  partition for the **production** figure with margin — recommend a **≥ 512 KB**
  LittleFS partition so the same layout carries from the E1001 prototype to the
  C3 production board with no re-partition.
- **Open item for the maintainer (bench-only, repo can't tell us):** confirm the
  E1001's ESP32-S3 flash size and the **currently flashed partition table**.
  `firmware/blink/blink.ino:26` prints `ESP.getFlashChipSize()`; the production
  C3 flash size is a Phase 7 input. A 512 KB data partition is trivial against the
  4–16 MB typical on these modules, but the active `partitions.csv` (or the
  selected Arduino partition scheme) must actually reserve it.

### Wear implications

- Flash endurance on these parts is ~100 K erase cycles per sector, and LittleFS
  wear-levels writes across the partition. The critical design choice that makes
  wear a non-issue: **frames are written to flash only on a network wake**, i.e.
  the 1–2×/day scheduled refresh — **never** on a button toggle (a toggle only
  _reads_ flash). So the write rate is the refresh cadence: ~2 writes/day →
  ~730/year → well under endurance limits for the device's entire service life,
  before wear-leveling even helps.
- Only rewrite when the frame actually changed — gate the flash write on the
  `Last-Modified`/304 result. A 304 wake (within a freshness window) writes
  nothing; only a 200 wake (config edit or data-bucket boundary, RFC 0001 §4)
  replaces the cached pair. This further reduces writes below the nominal cadence.

### Read-on-wake path

```
button (ext1) wake
  -> (radio stays off)
  -> mount LittleFS
  -> next = other(currentOrientation)
  -> read /orient/frames.bin at next's offset into g_fb
  -> drawFrame()            // existing init/upload/refresh/sleep
  -> currentOrientation = next   (RTC_DATA_ATTR + NVS mirror)
  -> re-arm both wake sources, deep sleep
```

If LittleFS is unmounted/empty (e.g. button pressed before the first network
wake ever populated it), the device logs and sleeps without drawing — same
"degrade to no-op, retry/ignore" discipline as the Phase 5 resilient path.

## Question 3 — Manual trigger input

**Recommendation for the E1001 prototype: reuse the existing recessed pinhole
(GPIO2) with press-duration discrimination.** A short tap (release before
~1.5 s) toggles orientation; the existing ≥5 s hold still factory-resets; the
1.5–5 s dead-band does nothing (so a hesitant press can't accidentally reset).

### Rationale and tradeoffs

- **Zero new hardware / no enclosure change.** GPIO2 is already the pinhole on
  the E1001 (`provisioning.ino:77`, J2 header pin 4, one pin from GND), it is a
  plain non-strapping GPIO/ADC pin, and it is **RTC-capable on the S3**, so it can
  serve as an ext1 deep-sleep wake source (Question 4). It is bench-testable
  exactly like the factory reset: bridge J2 pin 4 to J2 pin 2 (GND).
- **The factory-reset hold semantics are preserved.** `checkPinhole`
  (`provisioning.ino:398`) already debounces a continuous hold and resets the
  timer on release; the toggle is just a second, shorter threshold on the same
  measured hold. On an ext1 wake the button is held LOW (that is what woke us), so
  the device stays awake, times the hold, and branches: `< 1.5 s` → toggle,
  `≥ 5 s` → factory reset, in-between → no-op.
- **Tradeoff — overloaded input.** A paperclip pinhole is a poor _everyday_
  "flip my screen" affordance, and one physical input now carries two meanings.
  This is acceptable **because #160 targets the E1001 _test_ device to prove the
  cache-both-redraw-locally mechanism**, not to ship the final UX. The production
  manual affordance (a dedicated side/top tactile button, or simply relying on
  the tilt-switch auto-rotate of #49) is deferred.
- **Alternative — dedicated button on a free RTC-capable GPIO.** Cleaner UX, but
  (1) needs a new enclosure hole → must coordinate with the SCAD model (#50), and
  (2) needs a **free RTC-capable GPIO**, which is scarce on the E1001: SCK 7,
  MOSI 9, CS 10, DC 11, RES 12, BUSY 13 are the panel SPI bus; GPIO0 is
  BOOT/USB-DTR; GPIO19/20 are native USB; GPIO2 is the pinhole. A specific free
  pin would have to be confirmed against the board's exposed headers at the bench
  — see open questions. Recommend deferring this to production rather than
  blocking #160 on an enclosure decision.

### MCU-specific (mark for Phase 7 C3 port #57)

- On the production **ESP32-C3** the pinhole is **GPIO9** (the strapping pin with
  a natural pull-up), per the existing `IB_DEV_E1001` split
  (`provisioning.ino:75–80`). The same short-tap/long-hold discrimination applies;
  only the pin number and the wake API (Question 4) change.

## Question 4 — Wake source

**Recommendation: enable the pinhole GPIO as an ext1 deep-sleep wake source**
on the S3, **in addition to** the existing RTC-timer wake, and branch on
`esp_sleep_get_wakeup_cause()`.

### Mechanism (E1001 / ESP32-S3)

- The pinhole idles HIGH (internal pull-up) and reads LOW when pressed
  (`provisioning.ino:399`). ext1 wakes on a level: use
  `esp_sleep_enable_ext1_wakeup(BIT(PINHOLE_GPIO), ESP_EXT1_WAKEUP_ANY_LOW)`.
- Keep the existing `esp_sleep_enable_timer_wakeup(...)`
  (`deep-sleep.ino:327`) armed too. Both sources coexist; the wake cause
  distinguishes them, exactly as `setup()` already inspects the cause today
  (`deep-sleep.ino:337`).

### Redraw-from-flash flow

```
setup() on wake:
  cause = esp_sleep_get_wakeup_cause()

  if cause == EXT1 (button):
     hold = time the press (button is LOW on wake)
     if hold < 1.5s:           // toggle
        load other(currentOrientation) from LittleFS -> g_fb
        drawFrame(); flip currentOrientation
     else if hold >= 5s:       // existing factory reset
        clearCreds(); restart
     // else: dead-band, no-op
     // NB: NO Wi-Fi this path

  else (TIMER or cold boot):   // existing network pull, extended
     pullBothFrames()          // GET /api/device/:id/frames
     on 200: write both frames to LittleFS; draw currentOrientation
     on 304: keep cached frames; no draw (unchanged power win)

  re-arm ext1 + timer; esp_deep_sleep_start()
```

The button path never touches the radio — that is the entire point: a flip costs
one eInk refresh and a flash read, not a Wi-Fi cycle.

### MCU-specific (mark for Phase 7 C3 port #57)

- The **ESP32-C3 has no ext1**; use
  `esp_deep_sleep_enable_gpio_wakeup(BIT(PINHOLE_GPIO), ESP_GPIO_WAKEUP_GPIO_LOW)`
  instead. Same branch-on-wake-cause logic; only the enable call differs. This
  mirrors the GPIO2-vs-GPIO9 pinhole split already in the codebase.

## Coordination with #48 (tilt hardware) and #49 (auto-rotate)

#160 is the **manual** trigger; #49 is the **automatic** (tilt-switch) trigger.
Everything _between_ the trigger and the panel is shared:

- **Shared enabler = "fetch both → store in flash → redraw locally."** Define a
  small firmware interface so both issues reuse it:
  - `storeFrames(landscape, portrait)` — write the pair to LittleFS (Question 2).
  - `redrawFromFlash(orientation)` — read one orientation and `drawFrame()`
    (Question 2 read path).
  - a single persisted `currentOrientation` slot (`RTC_DATA_ATTR` + NVS mirror)
    that both triggers read/write. #49's issue independently says it will "store
    current orientation in RTC memory" — this RFC's slot **is** that slot; they
    must not define two.
  - the combined `GET /api/device/:id/frames` endpoint (Question 1) — #49 fetches
    the same way.
- **Only the trigger differs.** #160: one button on ext1/GPIO-wake, short-tap
  toggle. #49: two tilt-switch GPIOs as wake sources, debounced, decoded to a
  4-orientation enum (its issue's `(A,B)` table).
- **4 orientations from 2 stored frames.** #49 wants four orientations
  (landscape, portrait, and both inverted); this RFC caches only the two base
  orientations. Recommend `/frames` stay a **2-frame** contract and the firmware
  derive the inverted variants by a **180° rotation of the cached buffer on the
  device** (a byte-reverse + in-byte 2bpp-pixel-reverse of the packed buffer),
  rather than the API shipping four frames (which would double bandwidth and
  flash). This keeps #160's flash budget at 2× and gives #49 all four cheaply.
  Flag as a cross-cutting decision to confirm with #49's owner; #49's separate
  server-side `rotateFrameBuffer()` plan (its issue body) would then apply to the
  _web preview_ path, while the _device_ does its own 180° flip for the inverted
  cases. (90° transpose is **not** needed on-device — the server already renders
  true portrait via `renderBoth`; only the 180° invert is a local transform.)

## Scope / phasing

**In scope for #160:**

1. **API** — add `GET /api/device/:id/frames` (combined raw, Question 1) + tests.
   Server-only; no firmware dependency, lands first.
2. **Firmware flash store** — add a ≥512 KB LittleFS data partition;
   `storeFrames` on a 200 network wake; bench-verify both halves written and
   re-readable (Question 2).
3. **Firmware button wake + redraw** — ext1 pinhole wake, short-tap/long-hold
   discrimination, `redrawFromFlash` (Questions 3–4); bench-verify a tap flips
   orientation with Wi-Fi off.
4. **Extract the shared interface** (`storeFrames` / `redrawFromFlash` /
   `currentOrientation`) so #49 plugs in its tilt trigger.

**Deferred / out of scope:**

- Web-side toggle persistence (per the issue — separate issue).
- 4-orientation auto-rotate and tilt hardware (#49 / #48), beyond designing the
  shared interface here.
- Production dedicated button + enclosure hole (SCAD #50); the Phase 7 ESP32-C3
  port (#57) re-points the pin (GPIO2→GPIO9) and the wake API (ext1→GPIO-wake) —
  only the MCU-specific deltas above.
- Any change to the eInk cadence or RTC freshness model (RFC 0001 stands).

## Open questions for the maintainer

- **Flash/partition (bench-only):** what is the E1001 ESP32-S3 flash size and the
  currently flashed partition table? Is there room to add a ≥512 KB LittleFS data
  partition (there should be, but the active `partitions.csv` / Arduino partition
  scheme must reserve it)? Confirm via `ESP.getFlashChipSize()` at the bench.
- **Trigger choice:** accept pinhole short-tap reuse for the prototype, or invest
  now in a dedicated button (needs a free RTC-capable GPIO confirmed against the
  E1001 headers **and** a SCAD #50 enclosure change)?
- **Inverted orientations:** derive on-device via 180° rotation (keep the 2-frame
  `/frames` contract) vs. have the API return all four? (Affects #49; recommend
  on-device rotation.)
- **`/frames` 304:** confirm it should gate identically to `/frame` on the shared
  `Last-Modified` (recommended — keeps the power model consistent).
- **Store format:** one `/orient/frames.bin` (offset split) vs. two files? (Minor;
  recommend one file with header-declared lengths to mirror the wire format.)

## Testing

- **API unit:** `getDeviceFramesForPull` returns both buffers; 404/304/500 guards
  match `/frame`; 304 within a window, 200 at a data-bucket boundary; headers
  declare correct per-orientation byte lengths.
- **API integration:** `GET /frames` with mocked hydration → concatenated body of
  the expected total length; `If-Modified-Since` → 304 no body.
- **Firmware (bench, operator):** a 200 network wake writes both halves to
  LittleFS and they re-read byte-identical; a button tap with Wi-Fi off flips the
  panel orientation; a ≥5 s hold still factory-resets; a tap before the first
  network wake (empty store) no-ops without drawing.

## Security & privacy

- `/frames` reuses the existing trust boundary: the bearer device id in the URL,
  the same rate limiter (`consumeToken`), and the same `Last-Modified`/forget
  ride-along (`server.ts:505`). No new auth surface.
- Cached frames in flash are already-rendered public panel pixels (weather, etc.),
  not credentials; they carry no secret beyond what the panel already displays.
- The button-wake path makes **no** network call, so it adds no external
  exposure; the device still only ever talks to the InfoBento API (unchanged).
