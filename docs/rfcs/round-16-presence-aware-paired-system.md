> **Intent:** Preserve the Round 16 presence-aware counter and paired-pocket architecture for reuse on the canonical 5.76" panel.
> **Context:** The counter display is the 5.76" GDEH0576T81 multi-box bento dashboard, while retaining Core AQ + Presence. (Round 17's 2.13" mini-grid pivot was reverted — see the Round 18 note below.)
> **Pattern:** Keep the privacy, BLE pairing, and sensor abstractions; the 5.76" GDEH0576T81 dashboard is the current display.
> **Future:** Reconcile this RFC into a firmware RFC once the counter prototype path is validated.

# RFC: Round 16 — Presence-Aware Counter + Paired Pocket System

**Status:** draft, 2026-04-29
**Author:** founder
**Supersedes:** none (new RFC)
**Cross-references:** `~/.claude/plans/using-several-agents-develop-radiant-hearth.md` (marketing plan), `.tux/project.json` Round 16 note, `docs/hardware/SENSORS.md`

---

## Round 18 note (2026-06-06)

Round 18 supersedes Round 17's display pivot and restores the canonical 5.76" panel. The counter display and product-positioning assumptions in this RFC are now:

- Counter display is the Good Display GDEH0576T81, 5.76" B&W eInk, 920×680 px, 198 DPI, SSD2677 driver, 2-bit grayscale (4 levels). Refresh 1–2×/day. (The earlier 7.5" 800×480 and the Round 17 Waveshare 2.13" 250×122 mini-grid are both historical.)
- Counter UI is the multi-box bento dashboard (up to 10 boxes, multi-column), with the high-priority / full-screen alert takeover retained.
- ESP32-class controller drives the panel; Wi-Fi for cloud config/framebuffer fetch, BLE reserved for the paired-pocket v2 feature described below.
- Core AQ + Presence remains in scope, so the sensor, privacy, and BLE abstraction work here is still relevant.

Treat this RFC as the current presence-aware + paired-pocket architecture on the 5.76" GDEH0576T81 panel, plus reusable protocol design.

---

## Goals

Specify the firmware architecture for two related capabilities:

1. **Round 16 (v1, ships in counter):** presence-aware AQ alert escalation, knock-to-dismiss, single-button acknowledgment, RGB-LED across-room glance.
2. **v2 (post-launch, 6+ months after counter ships):** a paired pocket SKU that BLE-syncs the wearer's away-from-home AQ exposure to the counter unit on return.

The v1 firmware must lock in a `device_class` abstraction now so the v2 pocket reuses 80%+ of the codebase. Architecting the BLE pairing protocol now is the single most expensive thing to retrofit later.

---

## Non-goals

- Cloud-side aggregation of paired exposure data. The home counter is the source of truth; cloud only sees BentoConfig + base framebuffer requests, never sensor data.
- Multi-pocket-per-counter beyond N=4 (a family of four). Larger deployments fall outside the consumer scope.
- Cross-account pairing (gifting a paired device). Pair codes are per-counter; transferring requires the counter's pair-claim flow.
- Audio, voice, microphone integration. Explicitly rejected for privacy reasons.
- Cellular / LoRa connectivity for the pocket. v2 ships with BLE-only sync (sync on return to home), not real-time remote monitoring.

---

## Hardware split

| Component            | Counter v1                                            | Pocket v2                                                            |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| MCU                  | ESP32-C3 (Wi-Fi + BLE 5)                              | ESP32-C3                                                             |
| Display              | GDEH0576T81 5.76" eInk 920×680 (B&W, 2-bit grayscale) | 2.9" eInk 296×128 (Good Display GDEY029T94, partial-refresh capable) |
| CO2 (NDIR)           | SCD41                                                 | SCD41                                                                |
| VOC + IAQ + pressure | BME688                                                | (omitted — fits thermals + battery budget without it)                |
| PM                   | SEN54 (PM1/2.5/10)                                    | SEN54 (or smaller SPS30 if SEN54 doesn't fit pocket form)            |
| Presence             | HLK-LD2410C + AM312 PIR + privacy switch              | (none — wearable presence is implicit)                               |
| Knock                | LIS3DH                                                | LIS3DH (also for wear-detection)                                     |
| Button               | 1 front                                               | 1 side                                                               |
| RGB LED              | SK6812 (across-room glance)                           | (omitted — small SMD red/green for status only)                      |
| Battery              | Rechargeable + solar (sized for the 5.76" board)      | 500 mAh LiPo                                                         |
| Charging             | USB-C, target TBD                                     | USB-C, 1 week target                                                 |
| Form                 | Bento-box body sized around the 5.76" display         | ~75×40×22 mm clip-on                                                 |

Both run the same firmware codebase with `device_class` set at boot via a hardware-strap pin (or NVS flag on boards without a strap).

---

## Round 16 (v1, counter) — firmware architecture

### Sample schedule

| Subsystem                  | Cadence                                                         | Reason                                                                    |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SCD41 single-shot          | Every 5 min                                                     | Datasheet recommended low-power mode; ABC needs reads in the 7-day window |
| BME688 forced mode         | Every 5 min                                                     | BSEC needs ~5 min burn-in but stable readings thereafter                  |
| SEN54 measurement          | Every 15 min, 30 s sample                                       | Fan kicks on for sample, off otherwise — saves significant power          |
| LD2410C burst              | 500 ms every 30 s when PIR-quiet; 5 s every 5 s when PIR-active | Power-gated by MOSFET via ESP32-C3 GPIO; PIR provides the cheap interrupt |
| AM312 PIR                  | Always-on (~12 µA)                                              | Wakes ESP32 + powers radar on motion                                      |
| LIS3DH                     | Always-on tap-detect (~1.8 µA in low-power mode)                | INT1 → ESP32 wake on double-tap                                           |
| Front button               | GPIO interrupt                                                  | Wakes ESP32                                                               |
| RGB LED                    | Off by default; pulses on alert escalation                      | Single SK6812 driven from a GPIO via WS2812 protocol                      |
| eInk refresh               | Scheduled full dashboard + partial box / alert updates          | 5.76" GDEH0576T81 display path                                            |
| Wi-Fi connect + cloud poll | Per refresh tick                                                | Same as today                                                             |

### Local box-overlay pipeline

After cloud returns the base framebuffer, firmware composes the final image:

```
base_frame = cloud.fetch(config_json)       # no sensor data leaves device
sensor_state = read_all_sensors()           # SCD41, BME688, SEN54, LD2410C
presence_minutes = presence_tracker.update(sensor_state.lastpir, sensor_state.radar_present)

for box in config.sensor_overlay_boxes:
    if box.type == 'co2':
        box.render_overlay(base_frame, sensor_state.co2_ppm,
                           escalate=should_escalate(co2, presence_minutes))
    elif box.type == 'pm_local':
        box.render_overlay(base_frame, sensor_state.pm25,
                           escalate=should_escalate(pm25, presence_minutes))
    # ... etc

if any_alert_escalated:
    rgb_led.pulse_amber(duration_s=5)
    schedule_partial_refresh(box.region)

draw_to_panel(base_frame)
```

**Escalation rule:** `should_escalate(metric, presence_minutes)` returns true when `metric > threshold AND presence_minutes >= 30`. Without presence, alerts render in their normal "ambient" form (small leaf-to-dot icon swap), but never trigger the LED or the partial-refresh interrupt.

**Knock-to-dismiss:** LIS3DH double-tap wakes the device, marks all currently-escalated alerts as snoozed for 30 min, partial-refreshes the affected boxes back to their non-escalated state, and pulses the LED green for 200 ms as confirmation.

**Privacy switch:** Hardware GPIO read at boot AND every 60 s. When OFF, radar is power-gated to zero current, presence_minutes counter is reset, and presence-aware escalation is disabled. Threshold warnings may still render as normal dashboard states, but LED pulses / full-screen escalations require presence unless the user explicitly changes that behavior. The screen displays a small "presence: off" indicator in the corner during this state.

### `device_class` abstraction

A single `enum DeviceClass { Counter, Pocket }` set at boot routes all class-specific behavior:

| Behavior                 | Counter                                  | Pocket                                                      |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------- |
| Wi-Fi connect on refresh | yes                                      | no (BLE-only sync)                                          |
| Cloud framebuffer fetch  | yes                                      | no (renders locally from BLE-synced config)                 |
| Presence sensor read     | yes                                      | n/a (returns "always present" since it's wearable)          |
| BLE GATT role            | Peripheral (advertises pairable counter) | Central (scans for paired counter on movement to home)      |
| Sensor sample cadence    | Every 5–15 min                           | Every 1 min (movement-driven)                               |
| Display refresh          | Scheduled full + partial box updates     | On-demand partial (low refresh count)                       |
| Battery target           | Rechargeable + solar, 1–2 refreshes/day  | ~1 week                                                     |
| Geo / location           | n/a                                      | Optional GPS-less location-by-Wi-Fi-SSID-fingerprint (v2.5) |

All sensor I2C drivers, calibration logic, and box renderers are class-agnostic. Class-specific code lives in `firmware/src/device_class.rs` (or equivalent) — about 15% of the codebase.

---

## v2 paired pocket — BLE protocol design

### Pairing model

- One counter ↔ up to four pockets. Per-pair, not per-account.
- Pair codes printed on the back of each device (8-char base32). Counter scans QR on the pocket box, or user types the code into the counter's web editor.
- On pair: counter and pocket exchange ECDH-derived 256-bit shared keys (Curve25519 + HKDF-SHA256). Keys stored in ESP32 NVS encrypted-storage (eFuse-locked).
- Pair revocation: counter web editor "remove pocket" → counter broadcasts a revoke message at next discovery; pocket clears its key. If pocket can't reach the counter, key clears on factory reset (pinhole hold 5s).

### GATT service definition

Single proprietary service: **InfoBento Exposure Sync Service (IBESS)**.

| Characteristic | UUID (last 4 of 128-bit) | Properties     | Length              | Purpose                                                               |
| -------------- | ------------------------ | -------------- | ------------------- | --------------------------------------------------------------------- |
| `pair_state`   | 0x1601                   | read, notify   | 1 byte              | 0x00=unpaired, 0x01=paired, 0xFF=revoking                             |
| `device_info`  | 0x1602                   | read           | ~16 bytes           | device_class + firmware version + sensor capability bitfield          |
| `exposure_log` | 0x1603                   | read, indicate | up to 244 bytes/MTU | encrypted time-series exposure record (see schema below)              |
| `sync_cursor`  | 0x1604                   | read, write    | 8 bytes             | counter writes "last seen timestamp" so pocket only sends new records |
| `wall_time`    | 0x1605                   | read, write    | 8 bytes             | counter writes its current epoch ms; pocket adjusts its drifted RTC   |
| `revoke`       | 0x1606                   | write          | 32 bytes            | encrypted revocation token from counter to pocket                     |

All characteristics encrypted with the per-pair shared key (AES-256-GCM, 12-byte nonce per message, 16-byte auth tag). No characteristic ever returns plaintext sensor data.

### Exposure log record schema

Each record is a 32-byte CBOR-packed struct:

```
{
  ts: uint64,        # epoch ms, pocket's local clock (drift-corrected via wall_time char)
  co2_ppm: uint16,   # 0–10000 ppm, 1 ppm resolution
  pm25_ugm3: uint16, # 0–500 µg/m³, 0.1 resolution (×10 stored)
  pm10_ugm3: uint16, # same
  motion_flag: uint8,# 0=stationary, 1=walking, 2=in-vehicle (via LIS3DH)
  battery_pct: uint8,
  reserved: uint16   # for v2.5 additions (location-fingerprint hash, etc.)
}
```

Pocket appends one record per minute when wear-detected (via LIS3DH "any motion in past 60s") and one record per 15 min when stationary worn. Storage target: at least one normal day of records before overwrite. A 4096-byte NVS region only holds ~128 32-byte records, which is insufficient for a 500-record day; allocate at least 16KB for the exposure ring buffer or compress/coalesce records before claiming day-scale sync.

### Sync flow

1. Pocket detects re-entry to home (RSSI threshold of paired counter's BLE advertisement).
2. Pocket initiates GATT connect, reads `pair_state` to confirm pairing intact.
3. Pocket reads counter's `sync_cursor`, sends only records with `ts > cursor`.
4. Counter ACKs each record indication, advances cursor in NVS.
5. Counter merges pocket's records into its own daily timeline (rendered in a new "today's exposure" box on the dashboard).
6. Connection drops; pocket goes back to advertising-only sleep.

Typical sync target: <2 seconds for a day's records (~500 records × 32 bytes / 50 KB/s effective BLE throughput), assuming the storage target above is met.

### Privacy

- All pair keys generated on-device, never leave the device.
- Counter optionally exports the merged daily timeline as JSON for the user (web editor). Cloud never sees this data.
- Pocket motion_flag is intentionally coarse (3 values) to prevent identity inference.
- No GPS, no location-by-Wi-Fi-fingerprint in v2.0; reserved for v2.5 with explicit user consent.
- Pocket BLE advertisement does NOT include device name — only the IBESS service UUID + a randomized resolvable address. A bystander cannot identify "this is an InfoBento pocket worn by [person]" from radio traffic.

### Why this protocol vs alternatives

- **Why not Matter?** Matter is overkill for a 1:N closed family network and adds substantial firmware footprint (~200 KB code) the ESP32-C3 doesn't have headroom for after Wi-Fi + BLE + sensor stacks. Matter is a v3 consideration if the product grows into a Home-Assistant-integrated ecosystem.
- **Why not BLE Mesh?** Family-scale (≤4 devices) doesn't need mesh routing; point-to-point is simpler, lower-power, and easier to debug.
- **Why not just upload to cloud?** Privacy commitment ("sensor + presence data stays on-device") is the brand. Cloud-side aggregation breaks that promise even if we encrypt.
- **Why proprietary characteristic UUIDs?** No standardized IAQ-exposure-sync GATT service exists. Custom service is the honest path; we publish the spec in this RFC for self-hosters and integrators.

---

## Open questions (RFC-level)

1. **Pocket sensor bundle final spec.** SCD41 + SEN54 fits thermals; BME688 may fit if heat dissipation works. Bring-up will tell us. Confirm during pocket-board bring-up.
2. **Pair code printing.** Sticker on the back at assembly? QR code? Plain alphanumeric? ID firm decides post-counter-launch.
3. **Counter discovers pocket vs pocket discovers counter.** Currently spec'd as pocket-discovers (driven by RSSI threshold of counter's advertisement). Alternative: counter scans periodically. Power tradeoff: pocket-discovers saves counter power; counter-discovers reduces pocket battery cost. Re-evaluate after counter-board power validation against the rechargeable + solar budget.
4. **Web editor UI for paired pockets.** New section showing per-pocket name + exposure timeline + pair/revoke controls. Lifts to the existing editor schema (`packages/web/src/state.ts`).
5. **Multi-pocket conflict.** If two pockets sync overlapping-time records, counter merges both into the timeline (parent + kid both present). UI needs to distinguish the records visually (icon per pocket).
6. **Pocket factory reset behavior.** Today: pinhole hold 5s clears Wi-Fi credentials on counter. Pocket has no Wi-Fi — pinhole should clear pair key + exposure log. Confirm in firmware spec.
7. **Pocket-without-counter mode.** Should pocket function standalone (display its own exposure on its 2.9" eInk) if the user buys a pocket without a counter? Tradeoff: simpler UX vs muddied product story. **Recommendation: yes, but only as a fallback** — pocket displays a "pair me to a counter for full features" prompt on its main screen until paired.

---

## Files affected (when implementation begins)

- New repo: `firmware/` — Rust or C/ESP-IDF. Currently no firmware repo exists.
- New: `firmware/src/device_class.rs` — class abstraction
- New: `firmware/src/sensors/` — SCD41, BME688, SEN54, LD2410C, LIS3DH, AM312, button drivers
- New: `firmware/src/ble/ibess.rs` — IBESS GATT service implementation (v2 only; v1 stubs out as "BLE reserved")
- New: `firmware/src/exposure_log.rs` — record append + sync logic
- `packages/core/src/types.ts` — add 4 new BoxConfig variants (CO2, PM-local, AQI-local, presence-aware adaptive layout); add `ExposureRecord` type
- `packages/web/src/state.ts` — register new box types; new "Pocket" management section
- `packages/api/src/server.ts` — no changes (cloud doesn't see sensor data)
- `packages/api/src/db.ts` — no schema changes for v1; v2 adds an optional `paired_pockets` table for cloud-synced counter ↔ pocket configurations (if user opts in to sync)

---

## Implementation order (phased, post-Kickstarter funding)

**Phase A (counter v1, 8–12 weeks post-funding):**

1. Sensor SKU lock + sample order (SCD41, BME688, SEN54, LD2410C, AM312, LIS3DH)
2. Bring-up board with GDEH0576T81 5.76" panel (SSD2677) + ESP32 dev path + breakouts
3. Firmware: I2C drivers + LD2410C UART + LIS3DH interrupts + button + RGB LED + privacy switch GPIO
4. Local box-overlay pipeline + escalation rule
5. Industrial design: hex grille, radar keepout, button, LED, privacy slider, lanyard keyhole
6. Renderer: 4 new sensor-aware box variants in `packages/renderer/src/boxes/`
7. Web editor: new sensor box surfaces in `packages/web/src/components/box-config.ts`

**Phase B (counter v1.1 polish, 4–6 weeks):**

1. Calibration (NDIR ABC, BSEC burn-in, SEN54 fan reliability burn-in)
2. Power burn-in + 7-day battery validation
3. Privacy demo video + press kit photography
4. Live infobento.com/live deployment

**Phase C (pocket v2, 12–18 weeks, only after counter ICP validated):**

1. Pocket bring-up (2.9" GDEY029T94, smaller battery, smaller enclosure)
2. IBESS GATT service implementation (counter side)
3. IBESS client implementation (pocket side)
4. Pair code generation + print pipeline
5. Exposure log NVS storage + sync flow
6. Web editor "paired pockets" section
7. Family Bundle SKU + pricing ($129 counter + $59 pocket = $188 bundle, vs $499 Family Four-Pack of counters)

---

## Verification

- **Counter v1:**
  - All sensors return plausible readings within 60 s of power-up
  - LD2410C detects sitting human at 1.5 m, ignores empty room (false-positive rate <1/hour during 7-day burn-in)
  - Escalation rule fires only when the configured CO2 threshold is exceeded AND presence_minutes >= 30
  - Privacy switch OFF cuts radar power within 1 second; presence indicator on screen updates within 1 refresh
  - LIS3DH double-tap dismisses active alert + partial-refreshes the affected box within 2 seconds
  - 7-day power burn-in establishes the rechargeable + solar battery target from measured daily mAh

- **Pocket v2:**
  - Pair code QR scan binds pocket to counter in <30 s
  - Exposure log records append at ≥1/min when wear-detected
  - On-return sync completes in <2 s for a day's records
  - Revoke clears pocket key within 1 connect cycle of receiving the revoke message
  - Pocket battery sustains 1 week of normal use (8h wear-detect, 16h stationary)

If counter v1 misses the LD2410C false-positive bar, ship without escalation gating (alerts fire on threshold only); revisit presence in v1.1. If pocket v2 misses the sync-time bar, the product still functions — sync is just slower; not a blocker.
