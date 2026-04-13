/**
 * Intent: Display constants and default device profile
 * Context: Imported by layout.ts, index.ts, and downstream packages
 * Pattern: Leaf module — no imports from other core modules (breaks circular deps)
 * Future: Add constants for different device profiles
 */

import type { DeviceProfile } from './types.js';

/** Pixel dimensions of the eInk display */
export const DISPLAY_WIDTH = 240;
export const DISPLAY_HEIGHT = 200;

/** Padding between bento boxes (divider line) */
export const BOX_DIVIDER_PX = 1;

/** Default device profile for the 2.9" display */
export const DEFAULT_DEVICE: DeviceProfile = {
  widthPx: DISPLAY_WIDTH,
  heightPx: DISPLAY_HEIGHT,
  deviceId: 'infobento-2.9',
};
