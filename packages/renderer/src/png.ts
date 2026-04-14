/**
 * Intent: Convert 1-bit frame buffers to PNG images for preview and testing
 * Context: Called by /api/preview endpoint and used for visual verification
 * Pattern: Pure function — FrameBuffer in, PNG Uint8Array out
 * Future: Add color themes (dark mode inversion), configurable scale
 */

import { PNG } from 'pngjs';
import type { FrameBuffer } from './types.js';

/**
 * intent: Convert a 1-bit frame buffer to a scaled PNG image
 * method: Expand each source pixel to a scale×scale block of grayscale pixels
 * effect: At scale=3, a 240×200 frame becomes a 720×600 PNG (~few KB)
 */
export function frameToPng(fb: FrameBuffer, scale = 3): Uint8Array {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError(`scale must be a positive integer, got ${scale}`);
  }
  const outWidth = fb.width * scale;
  const outHeight = fb.height * scale;
  const png = new PNG({ width: outWidth, height: outHeight, colorType: 0 });

  const byteWidth = Math.ceil(fb.width / 8);

  for (let srcY = 0; srcY < fb.height; srcY++) {
    for (let srcX = 0; srcX < fb.width; srcX++) {
      const byteIndex = srcY * byteWidth + Math.floor(srcX / 8);
      const bitIndex = 7 - (srcX % 8);
      const srcByte = fb.data[byteIndex];
      const isSet = srcByte != null && (srcByte & (1 << bitIndex)) !== 0;

      // 1-bit: set pixel = black (0x00), unset = white (0xFF)
      const gray = isSet ? 0x00 : 0xff;

      // Fill scale×scale block in output
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const outX = srcX * scale + dx;
          const outY = srcY * scale + dy;
          // pngjs data buffer is always 4-byte RGBA regardless of colorType
          const idx = (outY * outWidth + outX) * 4;
          png.data[idx] = gray; // R
          png.data[idx + 1] = gray; // G
          png.data[idx + 2] = gray; // B
          png.data[idx + 3] = 0xff; // A
        }
      }
    }
  }

  return PNG.sync.write(png);
}
