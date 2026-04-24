/**
 * Intent: 14x14 native-resolution icons for bento box headers
 * Context: Drawn alongside labels in box headers at 920x680 display resolution
 * Pattern: Source bitmaps at 14x14, expanded 2x to 28x28 for native resolution
 * Convention: Each row is a 14-bit number, bit 13 = leftmost pixel
 */

/** Source icon dimensions */
const SRC_WIDTH = 14;
const SRC_HEIGHT = 14;
const SRC_SCALE = 2;

/** Rendered icon dimensions */
export const ICON_WIDTH = SRC_WIDTH * SRC_SCALE;
export const ICON_HEIGHT = SRC_HEIGHT * SRC_SCALE;

/* prettier-ignore */
const SRC_ICONS: Record<string, readonly number[]> = {
  // weather: Sun with rays
  weather: [
    0b00000100000000,
    0b00000100000000,
    0b00100100100000,
    0b00010000100000,
    0b00001111000000,
    0b01001001001000,
    0b00001001000000,
    0b01001001001000,
    0b00001111000000,
    0b00010001000000,
    0b00100100100000,
    0b00000100000000,
    0b00000100000000,
    0b00000000000000,
  ],
  // forecast: Bar chart with 4 bars of increasing height
  forecast: [
    0b00000000000000,
    0b00000000001100,
    0b00000000001100,
    0b00000000001100,
    0b00000011001100,
    0b00000011001100,
    0b00000011001100,
    0b00110011001100,
    0b00110011001100,
    0b00110011001100,
    0b00110011001100,
    0b11110011001100,
    0b11110011001100,
    0b11111111111100,
  ],
  // countdown: Hourglass
  countdown: [
    0b11111111111100,
    0b11111111111100,
    0b01100000011000,
    0b00110000110000,
    0b00011001100000,
    0b00001111000000,
    0b00000110000000,
    0b00001111000000,
    0b00011001100000,
    0b00110000110000,
    0b01100000011000,
    0b11111111111100,
    0b11111111111100,
    0b00000000000000,
  ],
  // text: Paragraph lines
  text: [
    0b11111111111100,
    0b11111111111100,
    0b00000000000000,
    0b11111111110000,
    0b11111111110000,
    0b00000000000000,
    0b11111111000000,
    0b11111111000000,
    0b00000000000000,
    0b11111100000000,
    0b11111100000000,
    0b00000000000000,
    0b11110000000000,
    0b11110000000000,
  ],
  // qr: QR finder pattern
  qr: [
    0b11111100111111,
    0b11111100111111,
    0b11001100110011,
    0b11001100110011,
    0b11111100111111,
    0b11111100111111,
    0b00000000000000,
    0b00000000000000,
    0b11111100111111,
    0b11111100111111,
    0b11001100110011,
    0b11001100110011,
    0b11111100111111,
    0b11111100111111,
  ],
  // quote: Opening quotation marks
  quote: [
    0b01100001100000,
    0b01100001100000,
    0b11000011000000,
    0b11000011000000,
    0b01100001100000,
    0b01100001100000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
  ],
  // date: Calendar grid
  date: [
    0b11111111111111,
    0b11111111111111,
    0b11010001001111,
    0b11010001001111,
    0b11111111111111,
    0b11111111111111,
    0b11010011001100,
    0b11010011001100,
    0b11100011001100,
    0b11100011001100,
    0b11010011001100,
    0b11010011001100,
    0b11111111111111,
    0b11111111111111,
  ],
  // moon: Crescent
  moon: [
    0b00001111000000,
    0b00011111100000,
    0b00111111110000,
    0b01111001100000,
    0b01110000000000,
    0b11110000000000,
    0b11100000000000,
    0b11110000000000,
    0b01110000000000,
    0b01111001100000,
    0b00111111110000,
    0b00011111100000,
    0b00001111000000,
    0b00000000000000,
  ],
  // sun: Rising sun with rays
  sun: [
    0b00000000000000,
    0b00010000100000,
    0b00001001000000,
    0b00000000000000,
    0b00011111100000,
    0b00111111110000,
    0b01111111111000,
    0b11111111111100,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
  ],
  // aqi: Leaf / air quality
  aqi: [
    0b00001100000000,
    0b00011100000000,
    0b00101010100000,
    0b00101010100000,
    0b00010101000000,
    0b00010101000000,
    0b00000000000000,
    0b10101010101000,
    0b10101010101000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
    0b00000000000000,
  ],
  // forecast3d: Calendar with diamond
  forecast3d: [
    0b11111111111111,
    0b11111111111111,
    0b11000000000011,
    0b11000000000011,
    0b11000011000011,
    0b11000111100011,
    0b11001111110011,
    0b11001111110011,
    0b11000111100011,
    0b11000011000011,
    0b11000000000011,
    0b11000000000011,
    0b11111111111111,
    0b11111111111111,
  ],
  // progress: Horizontal bar
  progress: [
    0b00000000000000,
    0b00000000000000,
    0b11111111111111,
    0b11111111111111,
    0b11111111000000,
    0b11111111000000,
    0b11111000000000,
    0b11111000000000,
    0b11111111000000,
    0b11111111000000,
    0b11111111111111,
    0b11111111111111,
    0b00000000000000,
    0b00000000000000,
  ],
};

/** Expand 14x14 source icons to 28x28 native resolution */
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

/** Native-resolution icon data (28x28 per icon) */
export const BOX_ICONS: Record<string, readonly number[]> = expandIcons(SRC_ICONS);
