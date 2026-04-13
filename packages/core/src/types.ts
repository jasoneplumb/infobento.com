/**
 * Intent: Refined type system for bento box configs, layout, and rendering
 * Context: Imported by all packages — types.ts is the source of truth for data shapes
 * Pattern: Discriminated unions for box configs, readonly throughout for immutability
 * Future: Add CountdownBoxConfig, WeatherBoxConfig, QRBoxConfig, QuoteBoxConfig
 */

// --- Box-specific configs ---

export interface TextBoxConfig {
  readonly type: 'text';
  readonly text: string;
  readonly align?: 'left' | 'center';
}

// Future box configs will be added here and to the union below

/** Discriminated union of all box-specific configurations */
export type BoxConfig = TextBoxConfig;

// --- Core types ---

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
  readonly config?: BoxConfig;
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

// --- Layout types ---

/** A positioned bento box within the display */
export interface LayoutBox {
  readonly box: BentoBox;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Result of the layout calculator */
export interface LayoutResult {
  readonly boxes: readonly LayoutBox[];
  readonly device: DeviceProfile;
}
