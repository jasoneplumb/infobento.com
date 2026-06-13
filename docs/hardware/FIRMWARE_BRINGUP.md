# Firmware Bring-Up Plan

> _Path to a first working firmware: prove the full loop on the reTerminal E1001 dev hardware, then port to the production GDEH0576T81._

## Why dev-first

The production panel (Good Display GDEH0576T81, 5.76" 920×680, SSD2677) is **not yet sourced** — its purchase is deferred (see [DISPLAY.md](DISPLAY.md)). The Seeed reTerminal E1001 (7.5" 800×480, ESP32-S3, 4-level grayscale) is in hand and maps 1:1 onto the renderer's 2-bit output. The cloud-side contract (`/api/device/:id/frame` + `/config`) is identical for both panels, so everything proven on the reTerminal ports directly. We bring up firmware on the reTerminal, then swap panel + MCU for production.

## What the firmware talks to (already built)

The cloud half of the contract is implemented and stable — firmware can be written against it today:

- `GET /api/device/:id/config` — config JSON, `If-Modified-Since`/`304`, `Last-Modified` (`packages/api/src/server.ts:607`)
- `GET /api/device/:id/frame?orientation=landscape|portrait` — raw 2-bit framebuffer (`application/octet-stream`), `X-Frame-Width` / `X-Frame-Height` headers, `If-Modified-Since`/`304` (`server.ts:629`)
- Device id **is** the bearer secret (opaque token, no auth header). Rate limit 10/min per device.
- Framebuffer format: 2-bit packed, 4 px/byte, `ceil(width/4) * height` bytes (`packages/core/src/constants.ts:15`). reTerminal: `ceil(800/4)*480 = 96,000` bytes. Production: `ceil(920/4)*680 = 156,400` bytes.

## Repo-side gaps the firmware needs (not yet built)

These are not firmware code but block an end-to-end provisioned device. Tracked / to-track:

1. **Device-minting path** — `createDevice()` exists in `db.ts:166` but nothing exposes it. For bring-up, mint a device row + pair code via a one-off script. For production, an admin/manufacturing path is needed (relates to sticker epic #80, QR generator #78).
2. **`POST /api/pair` HTTP route + web `/pair/:code` page** — issue **#74**. DB helper `claimDevice` is done; only the HTTP+web wiring remains. Not required for _bring-up_ (mint + hardcode the id), required for _real onboarding_.
3. **Captive-portal provisioning** — issue **#39** (firmware-side AP mode, Wi-Fi entry, NVS, custom-server-URL field per #80). Not required for bring-up (hardcode Wi-Fi creds); required before shipping.
4. **`POST /api/device/forget`** (web-side "forget Wi-Fi") — named in #39, not built.

## Framework decision

**Recommended: Arduino + GxEPD2.** Issue #57 already plans to validate the production panel with `GxEPD2_576_GDEH0576T81`, so using GxEPD2 across both dev and production keeps one display abstraction. ESP-IDF is the alternative (better deep-sleep control, larger learning curve) — defer unless GxEPD2's power management proves inadequate for the solar budget.

**Open integration risk — framebuffer translation.** The renderer emits a **2-bit packed** buffer (4 px/byte). GxEPD2 does not consume that layout directly — it expects either per-pixel writes or separated bitplanes for grayscale. The firmware must unpack our buffer into the controller's expected format (bit order + how the 4 levels map to the panel's grayscale waveforms). This is the single highest-uncertainty step and can only be validated on hardware (Phase 2). If translation is costly on-device, consider adding a firmware-friendly frame encoding to the API later — do **not** assume it now.

---

## Phases

Each phase is independently verifiable on the bench. Do not advance until the prior phase's "Done when" holds.

### Phase 0 — Prerequisites

- reTerminal E1001 in hand, USB-C data cable, Arduino IDE / arduino-cli + ESP32-S3 board support + GxEPD2.
- API reachable from the device's network (run `npm start -w @infobento/api`, note the LAN IP, or use a deployed instance).
- **Mint a bring-up device:** one-off script calling `createDevice(db, { pairCode })`; record the generated device **id**. Seed it a config via `updateDeviceConfig` so `/frame` returns 200 (it 404s with no `config_json` — `device.ts:74`).
- **Done when:** `curl http://<api>/api/device/<id>/frame` returns 200 with `X-Frame-Width: 800`.

### Phase 1 — Toolchain + blink

- Flash a minimal sketch; confirm serial logging and the board boots.
- **Done when:** a known-good Seeed reTerminal example draws _anything_ to the panel.

### Phase 2 — Panel bring-up from a static frame

- Fetch one frame once (hardcode the URL + device id), translate the 2-bit packed buffer to GxEPD2's format, and push it.
- This is where the framebuffer-translation risk is resolved. Validate grayscale level mapping and bit order against a known test frame.
- **Done when:** the panel shows the cloud-rendered frame correctly (4 levels, no smearing, correct orientation).

### Phase 3 — Wi-Fi + device-pull loop

- Connect Wi-Fi (hardcoded creds), `GET /frame` with the device id, honor `Content-Length` / `X-Frame-Width/Height`, send `If-Modified-Since` from the cached `Last-Modified` and skip the eInk refresh on `304`.
- Optionally `GET /config` first if firmware ever needs config locally (it does not render locally, so this is mainly for future use).
- **Done when:** editing the config server-side → device shows the new frame on next fetch; an unchanged config returns 304 and the panel is not refreshed.

### Phase 4 — Deep sleep + RTC wake (cadence)

- After refresh, enter deep sleep with an RTC timer wake. **Production cadence is 1–2×/day** ([POWER.md](POWER.md)); a 6h (4×/day) cadence is acceptable for a mains-powered dev unit but should be a config/build constant, not hardcoded, so production can dial it back.
- Cache last `Last-Modified` + framebuffer in flash so a failed fetch shows stale content (`CONNECTIVITY.md:53`).
- Handle clock drift / NTP resync across sleep windows.
- **Done when:** device wakes on schedule, fetches, refreshes only on change, returns to deep sleep; survives power-cycle showing the last good frame.

### Phase 5 — Resilience

- Wi-Fi failure → show cached frame, back off, sleep (don't hammer; rate limit is 10/min).
- Handle 404 (unprovisioned/no config), 429 (rate limited — honor `Retry-After`), 5xx (render error).
- **Done when:** device degrades gracefully with the API down, wrong creds, and an unprovisioned id.

### Phase 6 — Captive-portal provisioning (issue #39)

- Replace hardcoded Wi-Fi + device id with AP-mode first-boot: SSID `InfoBento-XXXX`, captive portal, NVS storage, OS auto-launch responses, pinhole reset, optional custom-server-URL field (#80).
- Display the device id during setup so the buyer can pair from the web (#80).
- **Done when:** a factory-reset device can be set up end-to-end from a phone with no hardcoded secrets.

### Phase 7 — Port to production (GDEH0576T81 + ESP32-C3)

- Order the dev kit and validate grayscale on the real panel (issue **#57** — ESP32-L (C02) kit + GDEH0576T81, GxEPD2 `GxEPD2_576_GDEH0576T81`).
- Swap panel dimensions (920×680), confirm framebuffer translation holds at the new size, re-measure refresh + deep-sleep current against the [power budget](POWER.md).
- Move to ESP32-C3 for production deep-sleep savings (#57 notes ~40% lower sleep current).
- **Done when:** the same loop runs on production hardware within the documented power budget.

## Critical path to "first working firmware flash"

```
Phase 0 (mint device, API up)  ──► Phase 1 (blink) ──► Phase 2 (static frame — RESOLVES framebuffer translation risk)
   ──► Phase 3 (Wi-Fi pull loop)  ──► Phase 4 (deep sleep cadence)
   = first working firmware on dev hardware
Phases 5–6 = ship-ready (resilience + provisioning)
Phase 7 = production hardware (gated on #57 dev-kit order + panel sourcing)
```

The earliest "it works" milestone is **end of Phase 4 on the reTerminal**. Production (Phase 7) is gated on ordering the GDEH0576T81 dev kit (#57), which is the long-pole external dependency.

## Related issues

- **#57** — order dev kit + validate grey rendering on GDEH0576T81 (gates Phase 7)
- **#39** — captive-portal provisioning UX (Phase 6)
- **#74** — `/api/pair` route + claim flow (real onboarding; bring-up uses minting instead)
- **#80 / #78 / #79** — device sticker, QR generator, production spec (physical pairing bridge)
- **#77** — SaaS-default hosting epic (server side — storage/auth/device-pull mostly built)
