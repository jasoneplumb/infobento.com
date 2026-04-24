/**
 * Intent: 7x7 pixel art icons for the 5 MVP bento box types
 * Context: Drawn alongside labels in box headers — same height as FONT_HEIGHT (7)
 * Pattern: Pure data — each icon is 7 rows of 7-bit-wide pixel data
 * Convention: Bit 6 = leftmost pixel, bit 0 = rightmost pixel
 */

/** Scale factor applied to source icon data */
const SRC_SCALE = 4;
const SRC_WIDTH = 7;
const SRC_HEIGHT = 7;

/** Width of each icon in pixels (native resolution) */
export const ICON_WIDTH = SRC_WIDTH * SRC_SCALE;

/** Height of each icon in pixels (native resolution) */
export const ICON_HEIGHT = SRC_HEIGHT * SRC_SCALE;

/**
 * 7x7 bitmap icon data keyed by box type.
 * Each icon is an array of 7 numbers — one per row.
 * Bits 6..0 map to pixels left-to-right (bit 6 = leftmost).
 */
const SRC_ICONS: Record<string, readonly number[]> = {
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

  /* forecast: Three vertical bars of increasing height (bar chart / trend)
   *   ......*
   *   ....*.*
   *   ....*.*
   *   ..*.*.*
   *   ..*.*.*
   *   *.*.*.*
   *   *******
   */
  forecast: [0b0000001, 0b0000101, 0b0000101, 0b0010101, 0b0010101, 0b1010101, 0b1111111],

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

  /* date: Calendar — top bar with two tick marks, grid below
   *   *******
   *   *.*..**
   *   *******
   *   *.*.**.
   *   ***.**.
   *   *.*.**.
   *   *******
   */
  date: [0b1111111, 0b1010011, 0b1111111, 0b1010110, 0b1110110, 0b1010110, 0b1111111],

  /* moon: Crescent — filled circle with right-side bite taken out
   *   ..***..
   *   .*****.
   *   *.**...
   *   *.*....
   *   *.**...
   *   .*****.
   *   ..***..
   */
  moon: [0b0011100, 0b0111110, 0b1011000, 0b1010000, 0b1011000, 0b0111110, 0b0011100],

  /* sun: Rising sun — half circle with rays above
   *   ..*.*..
   *   .......
   *   .*****.
   *   *******
   *   .......
   *   .......
   *   .......
   */
  sun: [0b0010100, 0b0000000, 0b0111110, 0b1111111, 0b0000000, 0b0000000, 0b0000000],

  /* aqi: Leaf / air symbol — wavy lines
   *   ..**...
   *   .*.*.*.
   *   .*.*.*.
   *   ..*.*..
   *   .......
   *   *.*.*.*
   *   .......
   */
  aqi: [0b0011000, 0b0101010, 0b0101010, 0b0010100, 0b0000000, 0b1010101, 0b0000000],

  /* forecast3d: Calendar with sun — 3-day daily forecast
   *   *******
   *   *.....*
   *   *..*..*
   *   *.*.*.*
   *   *..*..*
   *   *.....*
   *   *******
   */
  forecast3d: [0b1111111, 0b1000001, 0b1001001, 0b1010101, 0b1001001, 0b1000001, 0b1111111],

  /* progress: Horizontal bar chart — left-aligned fill
   *   .......
   *   *******
   *   *****..
   *   ***....
   *   *****..
   *   *******
   *   .......
   */
  progress: [0b0000000, 0b1111111, 0b1111100, 0b1110000, 0b1111100, 0b1111111, 0b0000000],
};

/** Expand source icon data to native resolution (28x28 from 7x7) */
function expandIcons(src: Record<string, readonly number[]>): Record<string, readonly number[]> {
  const result: Record<string, number[]> = {};
  for (const [name, icon] of Object.entries(src)) {
    const expanded: number[] = [];
    for (let srcRow = 0; srcRow < SRC_HEIGHT; srcRow++) {
      const srcBits = icon[srcRow] ?? 0;
      let outRow = 0;
      for (let srcCol = 0; srcCol < SRC_WIDTH; srcCol++) {
        const isSet = (srcBits & (1 << (SRC_WIDTH - 1 - srcCol))) !== 0;
        if (isSet) {
          for (let dx = 0; dx < SRC_SCALE; dx++) {
            outRow |= 1 << (ICON_WIDTH - 1 - (srcCol * SRC_SCALE + dx));
          }
        }
      }
      for (let dy = 0; dy < SRC_SCALE; dy++) {
        expanded.push(outRow);
      }
    }
    result[name] = expanded;
  }
  return result;
}

/** Native-resolution icon data (28x28 per icon) — generated from 7x7 source */
export const BOX_ICONS: Record<string, readonly number[]> = expandIcons(SRC_ICONS);
