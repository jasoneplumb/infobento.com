# Display Specifications

## eInk Module

- **Size:** 2.9 inches diagonal
- **Resolution:** 240 x 200 pixels
- **Color depth:** 1-bit (black and white)
- **Refresh rate:** Full refresh 1-2x per day

## Frame Buffer Format

The renderer outputs a packed 1-bit-per-pixel frame buffer:

- **Byte order:** MSB first (leftmost pixel is bit 7)
- **Row stride:** 30 bytes per row (240 / 8)
- **Total size:** 6000 bytes (30 bytes x 200 rows)
- **Bit values:** 0 = black, 1 = white (or controller-dependent)

## Bento Box Layout

With 200 pixels of vertical space and 4-6 bento boxes:

| Boxes | Height per box | Padding     | Notes                 |
| ----- | -------------- | ----------- | --------------------- |
| 4     | ~45px          | 5px between | Comfortable, readable |
| 5     | ~35px          | 5px between | Compact but usable    |
| 6     | ~28px          | 4px between | Dense, small text     |

Each box spans the full 240px width with a 1px border.

## Display Candidates

Research needed: identify specific 2.9" eInk modules that meet the size, resolution, and power constraints for a credit-card form factor.
