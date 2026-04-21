/**
 * Intent: Refined type system for bento box configs, layout, and rendering
 * Context: Imported by all packages — types.ts is the source of truth for data shapes
 * Pattern: Discriminated unions for type-safe box type <-> config pairing
 * Future: Add CountdownBoxConfig, WeatherBoxConfig, QRBoxConfig, QuoteBoxConfig
 */

// --- Box-specific configs ---

export interface TextBoxConfig {
  readonly type: 'text';
  readonly text: string;
  readonly align?: 'left' | 'center';
}

/** Pre-fetched weather data — the renderer never fetches, only displays */
export interface WeatherData {
  readonly temperature: number;
  readonly condition: string;
  readonly high: number;
  readonly low: number;
}

export interface WeatherBoxConfig {
  readonly type: 'weather';
  readonly city: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly data?: WeatherData;
}

export interface CountdownBoxConfig {
  readonly type: 'countdown';
  readonly targetDate: string; // ISO date, e.g. '2026-12-31'
  readonly label: string; // e.g. 'Vacation', 'Launch Day'
}

export interface QRBoxConfig {
  readonly type: 'qr';
  readonly url: string;
}

/** Discriminated union of all box-specific configurations */
export type BoxConfig = TextBoxConfig | WeatherBoxConfig | CountdownBoxConfig | QRBoxConfig;

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

/** Base fields shared by all bento boxes */
interface BentoBoxBase {
  readonly id: string;
  readonly label: string;
}

/** Text box with typed config */
interface TextBentoBox extends BentoBoxBase {
  readonly type: 'text';
  readonly config?: TextBoxConfig;
}

/** Weather box with typed config */
interface WeatherBentoBox extends BentoBoxBase {
  readonly type: 'weather';
  readonly config?: WeatherBoxConfig;
}

/** Countdown box with typed config */
interface CountdownBentoBox extends BentoBoxBase {
  readonly type: 'countdown';
  readonly config?: CountdownBoxConfig;
}

/** QR code box with typed config */
interface QRBentoBox extends BentoBoxBase {
  readonly type: 'qr';
  readonly config?: QRBoxConfig;
}

/** Box types that don't have a config yet (placeholder) */
interface UnconfiguredBentoBox extends BentoBoxBase {
  readonly type: Exclude<BentoBoxType, 'text' | 'weather' | 'countdown' | 'qr'>;
  readonly config?: undefined;
}

/**
 * A single bento box in the layout.
 * Discriminated union ensures box.type and box.config.type always agree.
 */
export type BentoBox =
  | TextBentoBox
  | WeatherBentoBox
  | CountdownBentoBox
  | QRBentoBox
  | UnconfiguredBentoBox;

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
