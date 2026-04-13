/**
 * Intent: Central type definitions and layout engine for InfoBento displays
 * Context: Imported by renderer, api, and web packages
 * Pattern: Pure types + pure functions — no side effects, no runtime dependencies
 * Future: Add validation schemas (Zod/Valibot)
 */

// Re-export all types
export type {
  TextBoxConfig,
  BoxConfig,
  BentoBoxType,
  BentoBox,
  BentoConfig,
  DeviceProfile,
  LayoutBox,
  LayoutResult,
} from './types.js';

// Re-export layout engine
export { calculateLayout } from './layout.js';

/** Pixel dimensions of the eInk display */
export const DISPLAY_WIDTH = 240;
export const DISPLAY_HEIGHT = 200;

/** Padding between bento boxes (divider line) */
export const BOX_DIVIDER_PX = 1;

/** Default device profile for the 2.9" display */
export const DEFAULT_DEVICE = {
  widthPx: DISPLAY_WIDTH,
  heightPx: DISPLAY_HEIGHT,
  deviceId: 'infobento-2.9',
} as const;
