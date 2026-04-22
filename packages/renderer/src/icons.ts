/**
 * Intent: 7x7 pixel art icons for the 5 MVP bento box types
 * Context: Drawn alongside labels in box headers — same height as FONT_HEIGHT (7)
 * Pattern: Pure data — each icon is 7 rows of 7-bit-wide pixel data
 * Convention: Bit 6 = leftmost pixel, bit 0 = rightmost pixel
 */

/** Width of each icon in pixels */
export const ICON_WIDTH = 7;

/** Height of each icon in pixels */
export const ICON_HEIGHT = 7;

/**
 * 7x7 bitmap icon data keyed by box type.
 * Each icon is an array of 7 numbers — one per row.
 * Bits 6..0 map to pixels left-to-right (bit 6 = leftmost).
 */
export const BOX_ICONS: Record<string, readonly number[]> = {
  /* weather: Sun — center dot with 4 cardinal rays (N/S/E/W)
   *   ...*...
   *   ...*...
   *   ..*.*..
   *   *..*..*
   *   ..*.*..
   *   ...*...
   *   ...*...
   */
  weather: [0b0001000, 0b0001000, 0b0010100, 0b1001001, 0b0010100, 0b0001000, 0b0001000],

  /* countdown: Hourglass — top/bottom bars with pinched waist
   *   *******
   *   .*...*
   *   ..*.*..
   *   ...*...
   *   ..*.*..
   *   .*...*
   *   *******
   */
  countdown: [0b1111111, 0b0100010, 0b0010100, 0b0001000, 0b0010100, 0b0100010, 0b1111111],

  /* text: Three horizontal lines of decreasing width (paragraph icon)
   *   *******
   *   .......
   *   ******.
   *   .......
   *   ****...
   *   .......
   *   ***....
   */
  text: [0b1111111, 0b0000000, 0b1111110, 0b0000000, 0b1111000, 0b0000000, 0b1110000],

  /* qr: 2x2 grid of small squares (mimics QR finder pattern)
   *   ***.***
   *   *.*.*.*
   *   ***.***
   *   .......
   *   ***.***
   *   *.*.*.*
   *   ***.***
   */
  qr: [0b1110111, 0b1010101, 0b1110111, 0b0000000, 0b1110111, 0b1010101, 0b1110111],

  /* quote: Opening double quotation marks (66-style)
   *   .**.**.
   *   .**.**.
   *   *..**.
   *   .......
   *   .......
   *   .......
   *   .......
   */
  quote: [0b0110110, 0b0110110, 0b1001100, 0b0000000, 0b0000000, 0b0000000, 0b0000000],
};
