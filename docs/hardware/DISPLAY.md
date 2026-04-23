# Display Specifications

## eInk Module

InfoBento uses a single color eInk panel mounted on the front of a monolithic counter device. The exact panel SKU is pending — see "Candidates" below.

- **Color depth:** ~7 colors (palette eInk — Spectra 6 / ACeP family)
- **Refresh rate:** 1–2× per day (matches the device's solar power budget and the calm-display use case)
- **Bit depth in software:** 3 bits per pixel for a 7-color palette (`Color` enum exported from `@infobento/core`)

Resolution and exact palette are panel-dependent and decided in #35 (panel + MCU sourcing). Existing code paths derive from `DISPLAY_WIDTH` / `DISPLAY_HEIGHT` / `DEFAULT_FRAME_BYTES` constants in `packages/core/src/constants.ts`, so changing the panel is a one-line edit there.

## Form Factor

Single front-mounted panel inset into a white housing with a thin bezel (≤4 mm visible on all sides). The recess is deep enough that the bezel rim shields the glass on a face-down drop. See `hardware/infobento.scad` for the current SCAD model and `docs/hardware/DROP-TEST.md` (planned, #36) for the drop survival protocol.

## Candidates

Picked in #35. Current shortlist:

| SKU                         | Resolution | Active area | Colors | BOM (approx) | Notes                                                  |
| --------------------------- | ---------- | ----------- | ------ | ------------ | ------------------------------------------------------ |
| Good Display 4.2" Spectra 6 | 640×400    | 84×64 mm    | 7      | $20–28       | Smallest, lowest BOM, less-readable from across a room |
| Pervasive 5.65" ACeP        | 600×448    | 115×86 mm   | 7      | $30–40       | Middle ground, slow refresh (~30 s)                    |
| Good Display 7.3" Spectra 6 | 800×480    | 160×96 mm   | 7      | $40–55       | Largest, most photogenic for Kickstarter, highest BOM  |

Selection criteria:

- Visible from across a typical room (kitchen counter to dining-table distance ~3 m)
- 7-color palette (gives the renderer real visual range without going to dithered photo eInk)
- Solar-budget compatible at 1–2 refreshes/day
- SPI interface compatible with chosen MCU

## Frame Buffer Format

The renderer outputs a packed N-bits-per-pixel frame buffer. After Phase 3a (#30) lands:

- **Bit depth:** 3 bits per pixel (8 indices into the `Color` palette; one is reserved/unused for 7-color panels)
- **Byte order:** packed left-to-right, MSB first, no alignment padding within a row
- **Total size:** `frameBufferBytes(width, height)` from `@infobento/core` — derived from the chosen panel
- **Color values:** indices into the `Color` enum exported from `@infobento/core`

Until Phase 3 lands, the codebase ships the legacy 1-bit packing (1 bit per pixel) inherited from the dual-display era.

## Refresh Strategy

Single mode, calm and infrequent.

| Mode                       | Refresh Rate | Use Case                                       |
| -------------------------- | ------------ | ---------------------------------------------- |
| Counter (default and only) | 1–2× per day | Kitchen counter / desk / shelf — solar powered |

There is no longer a phone-mounted minute-level refresh path — that died with the pivot away from MagSafe. Color eInk panels are slower per refresh (~15–30 s for full refresh on Spectra 6 / ACeP) than monochrome, but this is fine because we only refresh once or twice a day.

## Bento Box Layout

A larger color panel (e.g. 7.3" 800×480) supports comfortable multi-column layouts that the previous 128×296 portrait panel could not. The current `MAX_BOXES = 6` and `QR_HEIGHT_RATIO = 0.5` heuristics in `packages/core/src/layout.ts` should be revisited once the panel is chosen — there's room for 8–10 boxes with multi-column support on a larger canvas.
