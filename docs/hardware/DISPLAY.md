# Display Specifications

## eInk Module

InfoBento targets a Good Display GDEH0576T81 eInk panel mounted on the front of a monolithic counter device. The GDEH0576T81 purchase is currently deferred; initial development runs on off-the-shelf 7.5" panels — see [Prototyping Hardware](#prototyping-hardware) below.

- **Panel:** Good Display GDEH0576T81
- **Type:** eInk (electrophoretic)
- **Resolution:** 920x680 pixels, 198 DPI
- **Driver IC:** SSD2677
- **Active area:** 117.7 x 87.0 mm
- **Module size:** 125.4 x 99.5 x 0.9 mm
- **Refresh rate:** 1-3x per day (default 3, configurable) (matches the device's solar power budget and the calm-display use case)

Resolution, frame buffer size, and levels are defined by `DISPLAY_WIDTH` / `DISPLAY_HEIGHT` / `DEFAULT_FRAME_BYTES` constants in `packages/core/src/constants.ts`.

## Prototyping Hardware

The GDEH0576T81 (5.76", 920×680) is the production target. Until that panel is sourced, development and the web simulator run on the **Seeed reTerminal E1001** — a 7.5", 800×480 ePaper display with 4-level grayscale and an integrated ESP32-S3. (The standalone Seeed XIAO 7.5" panel is the same 800×480 panel on a XIAO driver board.) The reTerminal's 4-level grayscale maps 1:1 onto the renderer's 2-bit output.

The web simulator switches between display resolutions via the **Display** dropdown (driven by `DEVICE_PROFILES` in `@infobento/core`, default = reTerminal E1001 800×480; the GDEH0576T81 920×680 target is also selectable). Add new panels by appending to that list — the renderer honors per-config `width`/`height`, so any profile renders at its native resolution and aspect ratio.

## Form Factor

Single front-mounted panel inset into a white housing with a thin bezel (<=4 mm visible on all sides). The recess is deep enough that the bezel rim shields the glass on a face-down drop. `hardware/infobento.scad` is a legacy dual-display clamshell mockup from an earlier design direction; the SCAD model for the current 5.76" monolithic body is planned (#199). See `docs/hardware/DROP-TEST.md` (planned, #36) for the drop survival protocol.

## Frame Buffer Format

The renderer outputs a packed 2-bit-per-pixel frame buffer:

- **Bit depth:** 2 bits per pixel (4 levels)
- **Packing:** 4 pixels per byte, MSB-first
- **Byte order:** packed left-to-right, no alignment padding within a row
- **Total size:** 156,400 bytes for 920x680 (920 \* 680 / 4)
- **Level values (current renderer):** 0 = white, 1 = light gray, 2 = dark gray, 3 = black. The panel's grayscale runs the opposite way (0 = black … 3 = white), so firmware applies a per-pixel `3 − level` flip when uploading.

## Refresh Strategy

Single mode, calm and infrequent.

| Mode                       | Refresh Rate             | Refresh Time             | Use Case                                        |
| -------------------------- | ------------------------ | ------------------------ | ----------------------------------------------- |
| Counter (default and only) | 1-3x per day (default 3) | 0.75s full, 0.3s partial | Kitchen counter / desk / shelf -- solar powered |

The SSD2677 driver IC supports both full and partial refresh. Full refresh clears ghosting artifacts; partial refresh is faster and used when only a subset of the display content changes. The 0.75s/0.3s figures are production-panel datasheet numbers, not yet validated on hardware; the measured full 4-gray refresh on the E1001 dev panel is ~3.6–4.5s. Either way, refreshes are infrequent enough at the 1-3x per day cadence not to matter.

## Bento Box Layout

The 5.76" 920x680 landscape panel supports comfortable multi-column layouts. There is no fixed box cap; `packages/core/src/layout.ts` derives the row budget as `MAX_ROWS = min(10, max(4, floor(totalHeight / (fontSize * 3))))`, so it scales with panel height and font size, with configurable padding and corner radius. Layout is handled by the layout engine in `@infobento/core`.
