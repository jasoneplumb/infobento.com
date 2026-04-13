/**
 * Intent: Central type definitions and layout engine for InfoBento displays
 * Context: Imported by renderer, api, and web packages
 * Pattern: Pure types + pure functions — no side effects, no runtime dependencies
 * Future: Add Zod/Valibot schemas for config validation
 */

/** Pixel dimensions of the eInk display */
export const DISPLAY_WIDTH = 240;
export const DISPLAY_HEIGHT = 200;

/** Types of information a bento box can display */
export type BentoBoxType =
  | 'weather'
  | 'calendar'
  | 'tasks'
  | 'quote'
  | 'countdown'
  | 'stocks'
  | 'qr'
  | 'text';

/** A single bento box in the layout */
export interface BentoBox {
  readonly id: string;
  readonly type: BentoBoxType;
  readonly label: string;
  readonly heightPx: number;
}

/** Full device configuration */
export interface BentoConfig {
  readonly boxes: readonly BentoBox[];
  readonly refreshesPerDay: 1 | 2;
}

/** Physical device profile */
export interface DeviceProfile {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly deviceId: string;
}

/** Default device profile for the 2.9" display */
export const DEFAULT_DEVICE: DeviceProfile = {
  widthPx: DISPLAY_WIDTH,
  heightPx: DISPLAY_HEIGHT,
  deviceId: 'infobento-2.9',
};
