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
  ForecastEntry,
  ForecastBoxConfig,
  Forecast3DEntry,
  Forecast3DBoxConfig,
  CountdownBoxConfig,
  QRBoxConfig,
  QuoteBoxConfig,
  DateBoxConfig,
  MoonBoxConfig,
  SunData,
  SunBoxConfig,
  AQIData,
  AQIBoxConfig,
  ProgressBoxConfig,
  StockData,
  StockDuration,
  StocksBoxConfig,
  CalendarEvent,
  CalendarBoxConfig,
  HabitEntry,
  HabitBoxConfig,
  HoroscopeBoxConfig,
  JokeBoxConfig,
  OnThisDayBoxConfig,
  BoxConfig,
  BentoBoxType,
  BentoBox,
  BentoConfig,
  DeviceProfile,
  LayoutBox,
  LayoutResult,
} from './types.js';

// Re-export constants
export {
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  DEFAULT_DEVICE,
  DEFAULT_FRAME_BYTES,
  frameBufferBytes,
  DEVICE_PROFILES,
  DEFAULT_PROFILE_ID,
} from './constants.js';
export type { DeviceProfilePreset } from './constants.js';

// Re-export stock duration presets
export { STOCK_DURATIONS, DEFAULT_STOCK_DURATION } from './types.js';

// Re-export layout engine
export { calculateLayout } from './layout.js';

// Re-export validation
export { validateBentoConfig, BentoConfigSchema } from './validation.js';
export type { ValidationError, ValidationResult } from './validation.js';
