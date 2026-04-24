# Display Specifications

## eInk Module

InfoBento uses a Good Display GDEH0576T81 B&W eInk panel mounted on the front of a monolithic counter device.

- **Panel:** Good Display GDEH0576T81
- **Type:** B&W eInk (electrophoretic), 2-bit grayscale (4 levels) in software
- **Resolution:** 920x680 pixels, 198 DPI
- **Driver IC:** SSD2677
- **Active area:** 117.7 x 87.0 mm
- **Module size:** 125.4 x 99.5 x 0.9 mm
- **Refresh rate:** 1-2x per day (matches the device's solar power budget and the calm-display use case)

Resolution, frame buffer size, and grayscale levels are defined by `DISPLAY_WIDTH` / `DISPLAY_HEIGHT` / `DEFAULT_FRAME_BYTES` constants in `packages/core/src/constants.ts`.

## Form Factor

Single front-mounted panel inset into a white housing with a thin bezel (<=4 mm visible on all sides). The recess is deep enough that the bezel rim shields the glass on a face-down drop. See `hardware/infobento.scad` for the current SCAD model and `docs/hardware/DROP-TEST.md` (planned, #36) for the drop survival protocol.

## Frame Buffer Format

The renderer outputs a packed 2-bit-per-pixel frame buffer:

- **Bit depth:** 2 bits per pixel (4 grayscale levels)
- **Packing:** 4 pixels per byte, MSB-first
- **Byte order:** packed left-to-right, no alignment padding within a row
- **Total size:** 156,400 bytes for 920x680 (920 \* 680 / 4)
- **Grayscale values:** 0 = black, 1 = dark gray, 2 = light gray, 3 = white

## Refresh Strategy

Single mode, calm and infrequent.

| Mode                       | Refresh Rate | Refresh Time             | Use Case                                        |
| -------------------------- | ------------ | ------------------------ | ----------------------------------------------- |
| Counter (default and only) | 1-2x per day | 0.75s full, 0.3s partial | Kitchen counter / desk / shelf -- solar powered |

The SSD2677 driver IC supports both full and partial refresh. Full refresh clears ghosting artifacts; partial refresh is faster and used when only a subset of the display content changes. Both are fast enough to be imperceptible at the 1-2x per day cadence.

## Bento Box Layout

The 5.76" 920x680 landscape panel supports comfortable multi-column layouts. The current `MAX_BOXES = 10` in `packages/core/src/layout.ts` allows up to 10 boxes with configurable padding and corner radius. Layout is handled by the layout engine in `@infobento/core`.

Color eInk is deferred to v2.
