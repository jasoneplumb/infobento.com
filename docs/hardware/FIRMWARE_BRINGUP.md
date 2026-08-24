# Firmware Bring-Up Plan

> _Path to a first working firmware: prove the full loop on the reTerminal E1001 dev hardware, then port to the production GDEH0576T81._

**Status (2026-08):** **Phases 0–6 are ✅ bench-verified on the reTerminal E1001** — the first-working-flash milestone (end of Phase 4) plus resilience (Phase 5) and captive-portal provisioning (Phase 6) — and **Phase 7 has ✅ shipped as the merged integrated build** (`firmware/integrated/`, PR #174, issue #173): provisioning + dual-orientation deep-sleep pull + green-button orientation flip + two-white-button factory reset in one sketch. What remains is porting to the production GDEH0576T81 + ESP32-C3 once the panel is sourced (**#57** is closed — 4-level gray is proven on the E1001). Authoritative per-phase sketch status, serial traces, and the bench power snapshot live in [`firmware/README.md`](../../firmware/README.md#phase-status); operator bench checklists in [PHASE4_BENCH_CHECKLIST.md](PHASE4_BENCH_CHECKLIST.md) and the [E1001 walkthrough](walkthrough-E1001-hw-setup.md).

## Why dev-first

The production panel (Good Display GDEH0576T81, 5.76" 920×680, SSD2677) is **not yet sourced** — its purchase is deferred (see [DISPLAY.md](DISPLAY.md)). The Seeed reTerminal E1001 (7.5" 800×480, ESP32-S3, 4-level grayscale) is in hand and maps 1:1 onto the renderer's 2-bit output. The cloud-side contract (`/api/device/:id/frames` + `/frame` + `/config`) is identical for both panels, so everything proven on the reTerminal ports directly. We bring up firmware on the reTerminal, then swap panel + MCU for production.

## What the firmware talks to (already built)

The cloud half of the contract is implemented and stable — firmware can be written against it today:

- `GET /api/device/:id/config` — config JSON, `If-Modified-Since`/`304`, `Last-Modified` (`packages/api/src/server.ts:607`)
- `GET /api/device/:id/frame?orientation=landscape|portrait` — raw 2-bit framebuffer (`application/octet-stream`), `X-Frame-Width` / `X-Frame-Height` headers, `If-Modified-Since`/`304` (`server.ts:629`)
- `GET /api/device/:id/frames` — **both** orientation framebuffers in one response (portrait pre-rotated server-side); this is the endpoint the current integrated firmware pulls
- Device id **is** the bearer secret (opaque token, no auth header). Rate limit 10/min per device.
- Framebuffer format: 2-bit packed, 4 px/byte, `ceil(width/4) * height` bytes (`packages/core/src/constants.ts:15`). reTerminal: `ceil(800/4)*480 = 96,000` bytes. Production: `ceil(920/4)*680 = 156,400` bytes.

## Repo-side gaps the firmware needs (not yet built)

These are not firmware code but block an end-to-end provisioned device. Most are now built:

1. **Device-minting path** — ✅ **done** (PR #109). `mintDevice()` (`packages/api/src/mint.ts`) wraps `createDevice` + `setConfig` atomically with pair-code generation + collision retry; the bring-up CLI `scripts/mint-device.ts` mints a device, seeds a config (`--config`), and prints the device id + pair code + `/frame` URL. A deployable operator mint CLI for the prod host followed (PR #142, see [DEPLOY.md](../DEPLOY.md)). QR sticker generator done (#78, PR #121); the physical sticker spec remains (sticker epic #80, #79).
2. **`POST /api/pair` HTTP route + web `/pair/:code` page** — ✅ **done** (#74, PR #112). The claim flow (`claimDevice` + HTTP route + web page) is wired end-to-end for real onboarding.
3. **Captive-portal provisioning** — ✅ firmware sketch **bench-verified** (Phase 6 below; PR #133, #134). Remaining provisioning UX polish + the custom-server-URL self-host hatch tracked in issue **#39**.
4. **`POST /api/device/forget`** (web-side "forget Wi-Fi") — ✅ **done** (PR #132): same effect as the firmware pinhole reset.

## Framework decision

**Recommended: Arduino + GxEPD2.** Issue #57 already plans to validate the production panel with `GxEPD2_576_GDEH0576T81`, so using GxEPD2 across both dev and production keeps one display abstraction. ESP-IDF is the alternative (better deep-sleep control, larger learning curve) — defer unless GxEPD2's power management proves inadequate for the solar budget.

**Open integration risk — framebuffer translation.** The renderer emits a **2-bit packed** buffer (4 px/byte). GxEPD2 does not consume that layout directly — it expects either per-pixel writes or separated bitplanes for grayscale. The firmware must unpack our buffer into the controller's expected format (bit order + how the 4 levels map to the panel's grayscale waveforms). This is the single highest-uncertainty step and can only be validated on hardware (Phase 2). If translation is costly on-device, consider adding a firmware-friendly frame encoding to the API later — do **not** assume it now.

---

## Phases

Each phase is independently verifiable on the bench. Do not advance until the prior phase's "Done when" holds.

### Phase 0 — Prerequisites ✅ done

- reTerminal E1001 in hand, USB-C data cable, Arduino IDE / arduino-cli + ESP32-S3 board support + GxEPD2.
- API reachable from the device's network (run `npm start -w @infobento/api`, note the LAN IP, or use a deployed instance).
- **Mint a bring-up device:** ✅ run `npx tsx scripts/mint-device.ts --config <800x480-config.json>`; it mints a device (`createDevice` + pair code), seeds the config so `/frame` returns 200 (it 404s with no `config_json` — `device.ts:74`), and prints the device **id**.
- **Done when:** `curl http://<api>/api/device/<id>/frame` returns 200 with `X-Frame-Width: 800` (frame width follows the seeded config's resolution).

### Phase 1 — Toolchain + blink ✅ bench-verified

- Flash a minimal sketch; confirm serial logging and the board boots.
- **Done when:** a known-good Seeed reTerminal example draws _anything_ to the panel.

### Phase 2 — Panel bring-up from a static frame ✅ bench-verified (framebuffer translation retired)

- Fetch one frame once (hardcode the URL + device id), translate the 2-bit packed buffer to GxEPD2's format, and push it.
- This is where the framebuffer-translation risk is resolved. Validate grayscale level mapping and bit order against a known test frame.
- **Done when:** the panel shows the cloud-rendered frame correctly (4 levels, no smearing, correct orientation).

### Phase 3 — Wi-Fi + device-pull loop ✅ bench-verified

- Connect Wi-Fi (hardcoded creds), `GET /frame` with the device id, honor `Content-Length` / `X-Frame-Width/Height`, send `If-Modified-Since` from the cached `Last-Modified` and skip the eInk refresh on `304`.
- Optionally `GET /config` first if firmware ever needs config locally (it does not render locally, so this is mainly for future use).
- **Done when:** editing the config server-side → device shows the new frame on next fetch; an unchanged config returns 304 and the panel is not refreshed.

### Phase 4 — Deep sleep + RTC wake (cadence) ✅ bench-verified

- After refresh, enter deep sleep with an RTC timer wake. **Production cadence is 1–3×/day (default 3, ≈8 h between wakes)** ([POWER.md](POWER.md)); a 6h (4×/day) cadence is acceptable for a mains-powered dev unit but should be a config/build constant, not hardcoded, so production can dial it back.
- Cache last `Last-Modified` + framebuffer in flash so a failed fetch shows stale content (`CONNECTIVITY.md:53`).
- Handle clock drift / NTP resync across sleep windows.
- **Done when:** device wakes on schedule, fetches, refreshes only on change, returns to deep sleep; survives power-cycle showing the last good frame.
- **Status:** ✅ bench-verified on the E1001 (`firmware/deep-sleep/`, PR #127; marked bench-verified #130, operator checklist #128). RTC slow memory (`RTC_DATA_ATTR`) persists `Last-Modified` + a boot counter across sleeps, so a 304 wake returns to sleep without touching the panel — no flash framebuffer cache is needed since eInk holds the last frame for free. HTTPS for the production pull added in PR #144. Serial trace + bench power snapshot in [`firmware/README.md`](../../firmware/README.md#phase-status).

### Phase 5 — Resilience ✅ bench-verified

- Wi-Fi failure → show cached frame, back off, sleep (don't hammer; rate limit is 10/min).
- Handle 404 (unprovisioned/no config), 429 (rate limited — honor `Retry-After`), 5xx (render error).
- **Done when:** device degrades gracefully with the API down, wrong creds, and an unprovisioned id.
- **Status:** ✅ bench-verified on the E1001 (`firmware/resilient/`, PR #131). All five cases passed on the bench — API-down (`GET -> -1`), unprovisioned (`404`), Wi-Fi failure, rate-limit (`429` → 60 s back-off), and normal (one `200` draw then `304`); in every failure the panel kept its last good frame and the device slept and recovered on its own. Two correctness fixes over Phase 4: `checkBusy` records a timeout so `drawFrame()` aborts cleanly on a stuck panel, and the cached `Last-Modified` commits to RTC **only after a confirmed draw** (else a failed refresh would 304 the next wake and strand the panel). Operator bench-check steps in [`firmware/README.md`](../../firmware/README.md#phase-status).

### Phase 6 — Captive-portal provisioning (issue #39) ✅ bench-verified

- Replace hardcoded Wi-Fi + device id with AP-mode first-boot: SSID `InfoBento-XXXX`, captive portal, NVS storage, OS auto-launch responses, pinhole reset, optional custom-server-URL field (#80).
- Display the device id during setup so the buyer can pair from the web (#80).
- **Done when:** a factory-reset device can be set up end-to-end from a phone with no hardcoded secrets.
- **Status:** ✅ bench-verified on the E1001 (`firmware/provisioning/`, PR #133; bench-verified + E1001 pinhole pin **GPIO2** in PR #134). The full out-of-box flow was walked on serial: first boot → AP mode + captive portal → phone auto-launch → scan/join → NVS persist → reboot into provisioned. Web-side "forget Wi-Fi" (`POST /api/device/:id/forget`) merged in PR #132. Remaining provisioning UX polish + the custom-server-URL self-host hatch tracked in **#39**. (The later integrated build remapped factory reset from the pinhole to holding the **two white buttons** for 5 s — #171/#172; the GPIO2 pinhole remains on this provisioning-era sketch.)

### Phase 7 — Integrated build ✅ merged (PR #174, issue #173)

- `firmware/integrated/integrated.ino` folds the proven pieces into one sketch: captive-portal provisioning, the dual-orientation deep-sleep pull (`GET /api/device/:id/frames`), the green-button (GPIO3, ext1 wake) orientation flip, and factory reset via the two white buttons held 5 s (#171/#172).

### Remaining — Port to production (GDEH0576T81 + ESP32-C3)

- Grayscale validation on real hardware is done — issue **#57** is closed, with 4-level gray proven on the E1001; the production GDEH0576T81 panel is not yet sourced.
- Swap panel dimensions (920×680), confirm framebuffer translation holds at the new size, re-measure refresh + deep-sleep current against the [power budget](POWER.md).
- Move to ESP32-C3 for production deep-sleep savings (#57 notes ~40% lower sleep current).
- **Done when:** the same loop runs on production hardware within the documented power budget.

## Critical path to "first working firmware flash"

```
Phase 0 (mint device, API up)  ──► Phase 1 (blink) ──► Phase 2 (static frame — RESOLVES framebuffer translation risk)
   ──► Phase 3 (Wi-Fi pull loop)  ──► Phase 4 (deep sleep cadence)
   = first working firmware on dev hardware
Phases 5–6 = ship-ready (resilience + provisioning)
Phase 7 = integrated build (✅ merged PR #174); production port remains, gated on GDEH0576T81 sourcing
```

The earliest "it works" milestone — **end of Phase 4 on the reTerminal** — is **reached**, Phases 0–6 are all bench-verified (resilience and provisioning included), and Phase 7 shipped as the integrated build (PR #174). The remaining long pole is the production port, gated on sourcing the GDEH0576T81 panel (#57 closed — gray rendering proven on the E1001).

## Related issues

- **#57** — dev kit + validate grey rendering — ✅ closed (4-level gray proven on the E1001); production GDEH0576T81 panel sourcing remains the long pole
- **#39** — captive-portal provisioning UX polish (Phase 6 sketch bench-verified; #39 tracks the remainder) — _open_
- **#74** — `/api/pair` route + claim flow — ✅ done (PR #112)
- **#80 / #79** — device sticker + production spec (physical pairing bridge) — _open_; QR generator #78 ✅ done (PR #121)
- **#77** — SaaS-default hosting epic (server side — storage/auth/device-pull mostly built)
