# Display Specifications

## eInk Module

InfoBento targets a Good Display GDEH0576T81 eInk panel mounted on the front of a monolithic counter device. The GDEH0576T81 purchase is currently deferred; initial development runs on off-the-shelf 7.5" panels — see [Prototyping Hardware](#prototyping-hardware) below.

- **Panel:** Good Display GDEH0576T81
- **Type:** eInk (electrophoretic)
- **Resolution:** 920x680 pixels, 198 DPI
- **Driver IC:** SSD2677
- **Active area:** 117.7 x 87.0 mm
- **Module size:** 125.4 x 99.5 x 0.9 mm
- **Refresh rate:** 1-2x per day (matches the device's solar power budget and the calm-display use case)

Resolution, frame buffer size, and levels are defined by `DISPLAY_WIDTH` / `DISPLAY_HEIGHT` / `DEFAULT_FRAME_BYTES` constants in `packages/core/src/constants.ts`.

## Prototyping Hardware

The GDEH0576T81 (5.76", 920×680) is the production target. Until that panel is sourced, development and the web simulator run on two off-the-shelf Seeed 7.5", 800×480 ePaper displays:

| Display                    | Resolution | Levels             | Notes                                              |
| -------------------------- | ---------- | ------------------ | -------------------------------------------------- |
| **Seeed reTerminal E1001** | 800×480    | 4-level grayscale  | Integrated ESP32-S3 terminal. Default dev display. |
| **Seeed XIAO 7.5" panel**  | 800×480    | 1-bit B&W (UC8179) | Bare panel + driver board for a XIAO ESP32.        |

The reTerminal's 4-level grayscale maps 1:1 onto the renderer's 2-bit output; on the 1-bit XIAO panel the output is quantized/dithered to black & white.

The web simulator switches between all three resolutions via the **Display** dropdown (driven by `DEVICE_PROFILES` in `@infobento/core`, default = reTerminal 800×480). Add new panels by appending to that list. The renderer honors per-config `width`/`height`, so any profile renders at its native resolution and aspect ratio.

## Form Factor

Single front-mounted panel inset into a white housing with a thin bezel (<=4 mm visible on all sides). The recess is deep enough that the bezel rim shields the glass on a face-down drop. See `hardware/infobento.scad` for the current SCAD model and `docs/hardware/DROP-TEST.md` (planned, #36) for the drop survival protocol.

## Frame Buffer Format

The renderer outputs a packed 2-bit-per-pixel frame buffer:

- **Bit depth:** 2 bits per pixel (4 levels)
- **Packing:** 4 pixels per byte, MSB-first
- **Byte order:** packed left-to-right, no alignment padding within a row
- **Total size:** 156,400 bytes for 920x680 (920 \* 680 / 4)
- **Level values (current renderer):** 0 = darkest … 3 = lightest

## Refresh Strategy

Single mode, calm and infrequent.

| Mode                       | Refresh Rate | Refresh Time             | Use Case                                        |
| -------------------------- | ------------ | ------------------------ | ----------------------------------------------- |
| Counter (default and only) | 1-2x per day | 0.75s full, 0.3s partial | Kitchen counter / desk / shelf -- solar powered |

The SSD2677 driver IC supports both full and partial refresh. Full refresh clears ghosting artifacts; partial refresh is faster and used when only a subset of the display content changes. Both are fast enough to be imperceptible at the 1-2x per day cadence.

## Bento Box Layout

The 5.76" 920x680 landscape panel supports comfortable multi-column layouts. The current `MAX_BOXES = 10` in `packages/core/src/layout.ts` allows up to 10 boxes with configurable padding and corner radius. Layout is handled by the layout engine in `@infobento/core`.
