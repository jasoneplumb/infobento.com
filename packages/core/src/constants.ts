/**
 * Intent: Display constants and default device profile
 * Context: Imported by layout.ts, index.ts, and downstream packages
 * Pattern: Leaf module — no imports from other core modules (breaks circular deps)
 * Future: Add constants for different device profiles
 */

import type { DeviceProfile } from './types.js';

/** Pixel dimensions of the eInk display.
 *  Source of truth — all renderer/layout/test logic derives from these. */
export const DISPLAY_WIDTH = 920;
export const DISPLAY_HEIGHT = 680;

/** Bytes required to store a 2-bit frame buffer for the given dimensions
 *  (4 horizontal pixels per byte, 2 bits each). */
export function frameBufferBytes(widthPx: number, heightPx: number): number {
  return Math.ceil(widthPx / 4) * heightPx;
}

/** Bytes for the default device frame buffer */
export const DEFAULT_FRAME_BYTES = frameBufferBytes(DISPLAY_WIDTH, DISPLAY_HEIGHT);

/** Default device profile for the 2.9" display */
export const DEFAULT_DEVICE: DeviceProfile = {
  widthPx: DISPLAY_WIDTH,
  heightPx: DISPLAY_HEIGHT,
  deviceId: 'infobento-2.9',
};
