# Display Specifications

## eInk Module

- **Size:** 2.9 inches diagonal
- **Resolution:** TBD — codebase currently uses 240x200, but standard 2.9" panels are 296x128. Must reconcile with final hardware selection.
- **Color depth:** 1-bit (black and white)
- **Refresh rate:** Variable by mode — see Refresh Modes below

## Resolution Note

Standard 2.9" eInk panels (Waveshare, Good Display) are 296x128 pixels in landscape orientation. The codebase uses 240x200 (portrait). This is a known discrepancy that will be resolved when hardware is finalized. A 296x128 landscape display significantly changes the layout strategy — horizontal subdivision of bento boxes becomes viable.

## Form Factor

The display is one half of a MagSafe clamshell device. It must fit on an iPhone 15 Pro back (146.6 x 70.6mm). A standard 2.9" eInk module (~80 x 37mm active area) fits comfortably within these constraints.

## Frame Buffer Format

The renderer outputs a packed 1-bit-per-pixel frame buffer:

- **Byte order:** MSB first (leftmost pixel is bit 7)
- **Row stride:** 30 bytes per row (240 / 8) — will change with final resolution
- **Total size:** 6000 bytes (30 bytes x 200 rows) — will change with final resolution
- **Bit values:** 0 = black, 1 = white (or controller-dependent)

## Refresh Modes

The device operates in two refresh modes depending on physical state:

| Mode             | Refresh Rate      | Use Case                             |
| ---------------- | ----------------- | ------------------------------------ |
| Counter-standing | 1-2x per day      | Kitchen counter, desk — low power    |
| Phone-mounted    | Every few minutes | Back of phone — data must be current |

Phone-mounted mode uses eInk partial refresh to update at minute-level intervals without ghosting. This has a higher power draw but is offset by passive MagSafe charging from the iPhone.

## Bento Box Layout

With 200 pixels of vertical space and 4-6 bento boxes (current codebase):

| Boxes | Height per box | Padding     | Notes                 |
| ----- | -------------- | ----------- | --------------------- |
| 4     | ~45px          | 5px between | Comfortable, readable |
| 5     | ~35px          | 5px between | Compact but usable    |
| 6     | ~28px          | 4px between | Dense, small text     |

Each box spans the full 240px width with a 1px border. Layout strategy will be revisited when display resolution is finalized — a landscape panel may use side-by-side boxes.

## Display Candidates

Research needed: identify specific 2.9" eInk modules that meet the size and power constraints for the MagSafe clamshell form factor. Key criteria:

- Fits within iPhone 15 Pro back dimensions (146.6 x 70.6mm)
- Supports partial refresh for phone-mounted mode
- Low sleep current for counter-standing mode
- SPI interface compatible with ESP32-C3
