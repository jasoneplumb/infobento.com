# Phase 4 — Operator Bench-Verification Checklist

Deep sleep + RTC wake on the reTerminal E1001 (`firmware/deep-sleep/deep-sleep.ino`,
epic #106). This expands the "Phase 4 bench check" note in
[`firmware/README.md`](../../firmware/README.md) into a step-by-step the operator
runs at the bench.

A Claude session can write, compile, flash, and read serial — but the
**panel-visual** and **power-draw** confirmations need your eyes and a meter.
Those are the items only you can sign off.

## A. Pre-flight

- [ ] reTerminal E1001 connected via USB to the bench machine.
- [ ] `firmware/deep-sleep/secrets.h` present (gitignored) with **real** values:
      `WIFI_SSID`, `WIFI_PASS`, `IB_API_HOST` (the Hono API on your LAN or prod),
      `IB_API_PORT`, `IB_DEVICE_ID` (mint one: `npx tsx scripts/mint-device.ts`).
- [ ] Server reachable from the device:
      `curl http://<host>:<port>/api/device/<id>/frame` returns `200`.
- [ ] Serial monitor open at **115200** on the bridge port (`/dev/cu.usbserial-*`).
- [ ] **USB inline power meter** (or PSU mA readout / Nordic PPK2) between USB and
      the board — this is the one instrument that proves Phase 4 worked.
- [ ] `IB_SLEEP_SECONDS` is the bench default (~30 s) so you aren't waiting the
      production ~12 h between wakes.

## B. Functional checks (serial-observable)

- [ ] Builds + flashes clean; cold boot prints `boot #1 … (cold boot)`.
- [ ] **Cold cycle:** Wi-Fi connect → `GET -> 200` → `drew frame in ~4500 ms` →
      `deep sleep for 30 s` → goes quiet.
- [ ] **Timer wake:** ~30 s later it wakes on its own and prints
      `boot #2 … (RTC timer)` — confirms real deep sleep + timer wake, not a `delay()`.
- [ ] **304 skip (the important one):** with nothing changed server-side, the wake
      logs `GET -> 304 … skip refresh` and returns straight to `deep sleep` —
      **no `drew frame` line, and the panel does not flash.**
- [ ] **Boot counter climbs** (`#1`, `#2`, `#3`, …) across wakes → proves the
      `RTC_DATA_ATTR` state (including the cached `Last-Modified`) survived deep
      sleep. A reset back to `#1` means RTC state was lost — that would also force a
      needless `200`/redraw every wake.
- [ ] **200 draw:** change the device config (web editor → edit a box, or re-run
      `setConfig`) so the frame is newer; a later wake logs `GET -> 200` + a fresh
      `drew frame` + the new `Last-Modified`.

## C. Physical / instrument checks (only you can do these)

- [ ] **Panel correct:** image matches the config, sharp 4-level gray; it updates
      **only** on a `200` wake and never flickers/redraws on a `304`.
- [ ] **Current drops between wakes:** active (Wi-Fi + draw) is tens of mA; during
      deep sleep it falls to the board's floor. **On the reTerminal dev board the
      floor is NOT single-digit µA** — the board carries a USB-UART bridge and other
      peripherals. You're confirming a clear, repeatable **active → sleep drop**, not
      an absolute number. The production single-digit-µA target is an ESP32-C3
      measurement verified in Phase 7, not here.
- [ ] **Wake spike is brief:** current rises only for the fetch/draw window each
      cycle, then settles back to the floor.

## D. Sign-off

- [ ] One full run observed: cold draw → sleep → (`304` → sleep) ×N **with the boot
      counter climbing** → config change → `200` → draw → sleep.
- [ ] Record the `IB_SLEEP_SECONDS` used and the measured active / sleep currents in
      the Phase 4 PR.

---

**If a check fails**, capture the serial around it plus the meter reading and hand it
back to the session. Likely culprits:

| Symptom                               | Likely cause                                                                |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Boot counter resets to `#1` each wake | `RTC_DATA_ATTR` state not persisting across sleep                           |
| `200` / redraw on every wake          | cached `Last-Modified` not surviving sleep (`If-Modified-Since` sent empty) |
| Current doesn't drop in sleep         | Wi-Fi modem / EPD not powered down before `esp_deep_sleep_start()`          |
| Panel flashes on a `304` wake         | refresh not gated on the `200` path                                         |
