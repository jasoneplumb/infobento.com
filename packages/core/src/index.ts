/**
 * Intent: Central type definitions and layout engine for InfoBento displays
 * Context: Imported by renderer, api, and web packages
 * Pattern: Pure types + pure functions — no side effects, no runtime dependencies
 * Future: Add validation schemas (Zod/Valibot)
 */

// Re-export all types
export type {
  TextBoxConfig,
  WeatherData,
  WeatherBoxConfig,
  CountdownBoxConfig,
  QRBoxConfig,
  QuoteBoxConfig,
  BoxConfig,
  BentoBoxType,
  BentoBox,
  BentoConfig,
  DeviceProfile,
  LayoutBox,
  LayoutResult,
} from './types.js';

// Re-export constants
export { DISPLAY_WIDTH, DISPLAY_HEIGHT, BOX_DIVIDER_PX, DEFAULT_DEVICE } from './constants.js';

// Re-export layout engine
export { calculateLayout } from './layout.js';
