# Connectivity

## Decision (locked 2026-04-22)

InfoBento v1 ships **Wi-Fi direct + PWA-only**. No native phone app. The web editor at `infobento.com` is the only configuration surface. Native apps and BLE bridging are deferred to a possible v2 if backers fund them.

### Why

The box types InfoBento ships (text, countdown, weather, 3hr forecast, qr, quote) all work fine at 1-2 refreshes per day. There is no real-time latency requirement, so the entire native-app stack stays off v1's critical path.

This walks back two earlier-considered options:

- **Phone-bridged BLE** would require iOS + Android companion apps, carry iOS background-BLE risk, and add ~6+ months of engineering before launch
- **Hybrid (BLE when phone present, Wi-Fi when not)** would require both stacks plus the dual-platform native app investment

Pure Wi-Fi-direct + PWA cuts the engineering scope to something a solo founder can ship pre-Kickstarter, while still meeting all the user needs the box types actually serve.

### What this means concretely

- **MCU:** ESP32-C3 (Wi-Fi 4 + BLE 5). BLE radio is on the chip but unused in v1; remains available for a v2 BLE bridge without a hardware refresh.
- **Connectivity:** device makes outbound HTTPS calls to the cloud API. Cloud API hosted on DigitalOcean droplet (co-hosted with tiles- and webmap.dev) with Cloudflare in front for DNS + CDN + DDoS + TLS edge.
- **Configuration surface:** web editor at `infobento.com`. Browser localStorage for state. JSON import/export already shipped.
- **Companion app:** none.
- **Setup:** captive-portal Wi-Fi pairing on first boot.
- **Recovery:** recessed pinhole reset on the back-lower (grip area), centered, ~2mm hole. Press with paperclip for 5 seconds = factory reset (clears Wi-Fi credentials and any device-side config; device re-enters captive-portal AP mode). Documented on a small label on the back.

---

## First-time setup flow (captive portal)

Standard pattern, well-trod in IoT (every smart bulb does this):

1. Device boots. Finds no saved Wi-Fi credentials in NVS flash.
2. Device enters AP mode and advertises an SSID like `InfoBento-A1B2` (last 4 bytes of MAC).
3. User joins that network from any phone or laptop.
4. The OS detects a captive network (no internet) and auto-launches a browser to the device's setup page.
5. The device serves a small HTML setup page from its onboard web server. The page scans for nearby Wi-Fi networks, presents a dropdown, accepts a password.
6. User selects their home Wi-Fi, types the password, hits Connect.
7. Device saves credentials to NVS, joins the home network, AP mode shuts down.
8. Setup page redirects to `infobento.com/onboard?device=<id>` for box configuration.

The captive-portal HTML is part of the firmware — small enough to fit in flash without bloat.

## Config delivery

Config flows to the device in two stages:

1. **First-time (captive portal):** During AP-mode setup, the user enters Wi-Fi credentials and uploads a config JSON (exported from the web editor). The device stores config in ESP32 NVS.
2. **Ongoing (cloud poll):** The device polls `infobento.com/api/config/{device-id}` on each refresh cycle for config updates. If the cloud has a newer config, the device downloads it and overwrites the NVS copy.

### Server-side rendering

The device does not render locally. On each refresh cycle it sends its config JSON to the cloud API and receives a framebuffer back. The device caches the last framebuffer in flash so that if Wi-Fi is unavailable, the display shows stale content rather than going blank.

### Storage

- **Config:** ESP32 NVS (survives deep sleep and power loss; cleared by pinhole factory reset)
- **Last framebuffer:** flash (survives deep sleep and power loss; overwritten on each successful fetch)

## Recovery (pinhole reset)

The device has no buttons. The pinhole reset is the only physical recovery affordance.

- **Location:** back-lower (grip area), centered, ~2mm diameter, recessed
- **Action:** press with paperclip for 5 seconds
- **Effect:** factory reset — clears Wi-Fi credentials and any device-side cached config; device re-enters captive-portal AP mode on next boot
- **Why pinhole vs button:**
  - Smaller stress concentrator on a 4-foot drop than a clickable button
  - Doesn't require a separate housing opening (just a small recess in the bumper)
  - Industry-standard interaction (routers, smart speakers, mesh nodes — users won't be confused)
  - Can't be triggered accidentally
  - Documented on a small label on the back so users know what it's for

A web-side "forget Wi-Fi" command from the editor is also possible (`infobento.com` → device-status page → "forget Wi-Fi" button), but only works while the device has Wi-Fi. The pinhole is the dead-device backstop.

## Power profile (for reference)

See `docs/hardware/POWER.md` for the full breakdown. Summary at 1-2 refreshes/day on Wi-Fi:

- ~70 mA active for ~10-20s during Wi-Fi connect + frame fetch
- Per-refresh budget: ~1.5-2.5 mAh
- Daily budget: ~3.5 mAh
- Comfortably inside the solar harvest budget (5-15 mAh/day from indirect window light)

## v2 path (post-Kickstarter, if funded)

If backers want the calendar / real-time / phone-integration story later, the architecture supports it without a hardware refresh:

- **Native iOS / Android apps** as a v2 product — same hardware, new firmware track that uses the unused BLE radio
- **BLE bridge mode** can coexist with Wi-Fi-direct: device tries BLE first when phone is in range, falls back to Wi-Fi
- **Calendar box** that pulls from EventKit (iOS) / CalendarContract (Android) and pushes to device via BLE — this is what would actually motivate adding the native apps

None of this changes the v1 device. It's a firmware update + companion app, both shippable post-launch as a stretch goal or follow-on product.

## What's NOT in v1

- Native iOS app
- Native Android app
- BLE pairing flow
- Calendar / next-event box (no source-of-truth without phone integration)
- Real-time push from phone to device
- Multi-device sync via cloud account
- User accounts of any kind

These were all considered and consciously deferred to v2.
