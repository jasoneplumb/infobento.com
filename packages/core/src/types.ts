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
  /**
   * Location's offset from UTC in seconds (Open-Meteo `timezone=auto`). Lets a
   * co-located date box render the device's local date with zero extra fetches
   * (issue #166) — undefined when the provider omitted it.
   */
  readonly utcOffsetSeconds?: number;
}

export interface WeatherBoxConfig {
  readonly type: 'weather';
  readonly city: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly data?: WeatherData;
}

/** Single entry in an hourly forecast — time label + temperature + condition */
export interface ForecastEntry {
  readonly time: string; // e.g. '14:00' or '+1h'
  readonly temperature: number;
  readonly condition: string;
}

export interface ForecastBoxConfig {
  readonly type: 'forecast';
  readonly city: string;
  readonly lat?: number;
  readonly lon?: number;
  /** Number of upcoming hours to fetch/render (1–24, default 3). */
  readonly hours?: number;
  readonly entries?: readonly ForecastEntry[];
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

export interface QuoteBoxConfig {
  readonly type: 'quote';
  readonly text: string;
  readonly author?: string;
  /**
   * Comma-separated tag steer (e.g. "wisdom, happiness") persisted so pull-time
   * hydration can re-fetch a fresh random quote with the same filter. The `text`
   * above is a discardable seed — it's replaced on every pull (RFC 0001 §2).
   */
  readonly tags?: string;
}

/**
 * Hydration-resolved timezone context for the date box: the device location's
 * offset from UTC in seconds, so the renderer shows the *local* date instead of
 * the server's UTC clock. Derived from a co-located box at pull time (issue #166).
 */
export interface DateData {
  readonly utcOffsetSeconds: number;
}

export interface DateBoxConfig {
  readonly type: 'date';
  /**
   * Optional location (geocoded like the weather boxes) so the date resolves to
   * the correct local timezone even with no other location-bearing box present
   * (issue #168). Blank → fall back to a co-located box, then server time.
   */
  readonly city?: string;
  readonly data?: DateData;
  readonly showYearProgress?: boolean;
}

export interface MoonBoxConfig {
  readonly type: 'moon';
}

export interface SunData {
  readonly sunrise: string;
  readonly sunset: string;
  readonly dayLength: string;
}

export interface SunBoxConfig {
  readonly type: 'sun';
  readonly city: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly data?: SunData;
}

export interface AQIData {
  readonly aqi: number;
  readonly category: string;
  readonly dominantPollutant: string;
  readonly uvIndex?: number;
}

export interface AQIBoxConfig {
  readonly type: 'aqi';
  readonly city: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly data?: AQIData;
}

export interface ProgressBoxConfig {
  readonly type: 'progress';
  readonly label?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

/** Single entry in a daily forecast — day label + high/low + condition */
export interface Forecast3DEntry {
  readonly day: string; // e.g. 'Mon', 'Tue'
  readonly high: number;
  readonly low: number;
  readonly condition: string;
}

export interface Forecast3DBoxConfig {
  readonly type: 'forecast3d';
  readonly city: string;
  readonly lat?: number;
  readonly lon?: number;
  /** Number of upcoming days to fetch/render (1–20, default 3). */
  readonly days?: number;
  readonly entries?: readonly Forecast3DEntry[];
}

/** Pre-fetched stock/crypto data — the renderer never fetches, only displays */
export interface StockData {
  readonly price: number;
  readonly change: number; // absolute change
  readonly changePercent: number; // percentage change
}

/** Available preset durations for stock change comparison */
export type StockDuration = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y';

export const STOCK_DURATIONS: ReadonlyArray<{ value: StockDuration; label: string }> = [
  { value: '1d', label: '1 Day' },
  { value: '5d', label: '5 Days' },
  { value: '1mo', label: '1 Month' },
  { value: '3mo', label: '3 Months' },
  { value: '6mo', label: '6 Months' },
  { value: '1y', label: '1 Year' },
  { value: '5y', label: '5 Years' },
];

export const DEFAULT_STOCK_DURATION: StockDuration = '1d';

export interface StocksBoxConfig {
  readonly type: 'stocks';
  readonly symbol: string; // e.g. 'AAPL', 'BTC'
  readonly duration?: StockDuration; // defaults to '1d' when omitted
  readonly data?: StockData;
}

/** Pre-fetched "On This Day" entry from Wikipedia */
export interface OnThisDayBoxConfig {
  readonly type: 'onthisday';
  readonly text: string;
  readonly year?: string; // empty for holidays
  readonly category?: string; // events | births | deaths | holidays | all
}

/** Pre-fetched horoscope reading for a single zodiac sign */
export interface HoroscopeBoxConfig {
  readonly type: 'horoscope';
  readonly sign: string; // e.g. 'aries' (lowercase)
  readonly text: string; // the reading body
  readonly date?: string; // ISO date the reading is for
}

/** Discriminated union of all box-specific configurations */
export type BoxConfig =
  | TextBoxConfig
  | WeatherBoxConfig
  | ForecastBoxConfig
  | Forecast3DBoxConfig
  | CountdownBoxConfig
  | QRBoxConfig
  | QuoteBoxConfig
  | DateBoxConfig
  | MoonBoxConfig
  | SunBoxConfig
  | AQIBoxConfig
  | ProgressBoxConfig
  | StocksBoxConfig
  | HoroscopeBoxConfig
  | OnThisDayBoxConfig;

// --- Core types ---

/** Types of information a bento box can display */
export type BentoBoxType =
  | 'weather'
  | 'forecast'
  | 'forecast3d'
  | 'quote'
  | 'countdown'
  | 'stocks'
  | 'qr'
  | 'text'
  | 'date'
  | 'moon'
  | 'sun'
  | 'aqi'
  | 'progress'
  | 'horoscope'
  | 'onthisday';

/** Base fields shared by all bento boxes */
interface BentoBoxBase {
  readonly id: string;
  readonly label: string;
  /** Optional horizontal subdivision — 'left' and 'right' boxes share a row */
  readonly split?: 'left' | 'right';
  /** Relative height weight (1=compact, 2=normal, 3=tall). Defaults to 2. */
  readonly weight?: 1 | 2 | 3;
  /** Left-box width as a percent of a split row (the divider position), 20–80,
   *  default 50. Clamped via `splitLeftFraction` so neither box collapses. */
  readonly splitRatio?: number;
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

/** Hourly forecast box with typed config */
interface ForecastBentoBox extends BentoBoxBase {
  readonly type: 'forecast';
  readonly config?: ForecastBoxConfig;
}

/** Daily forecast box with typed config */
interface Forecast3DBentoBox extends BentoBoxBase {
  readonly type: 'forecast3d';
  readonly config?: Forecast3DBoxConfig;
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

/** Quote box with typed config */
interface QuoteBentoBox extends BentoBoxBase {
  readonly type: 'quote';
  readonly config?: QuoteBoxConfig;
}

/** Date box with typed config */
interface DateBentoBox extends BentoBoxBase {
  readonly type: 'date';
  readonly config?: DateBoxConfig;
}

/** Moon box with typed config */
interface MoonBentoBox extends BentoBoxBase {
  readonly type: 'moon';
  readonly config?: MoonBoxConfig;
}

/** Sun box with typed config */
interface SunBentoBox extends BentoBoxBase {
  readonly type: 'sun';
  readonly config?: SunBoxConfig;
}

/** AQI box with typed config */
interface AQIBentoBox extends BentoBoxBase {
  readonly type: 'aqi';
  readonly config?: AQIBoxConfig;
}

/** Progress box with typed config */
interface ProgressBentoBox extends BentoBoxBase {
  readonly type: 'progress';
  readonly config?: ProgressBoxConfig;
}

/** Stocks box with typed config */
interface StocksBentoBox extends BentoBoxBase {
  readonly type: 'stocks';
  readonly config?: StocksBoxConfig;
}

/** Horoscope box with typed config */
interface HoroscopeBentoBox extends BentoBoxBase {
  readonly type: 'horoscope';
  readonly config?: HoroscopeBoxConfig;
}

/** On This Day box with typed config */
interface OnThisDayBentoBox extends BentoBoxBase {
  readonly type: 'onthisday';
  readonly config?: OnThisDayBoxConfig;
}

/** Box types that don't have a config yet (placeholder) */
interface UnconfiguredBentoBox extends BentoBoxBase {
  readonly type: Exclude<
    BentoBoxType,
    | 'text'
    | 'weather'
    | 'forecast'
    | 'forecast3d'
    | 'countdown'
    | 'qr'
    | 'quote'
    | 'date'
    | 'moon'
    | 'sun'
    | 'aqi'
    | 'progress'
    | 'stocks'
    | 'horoscope'
    | 'onthisday'
  >;
  readonly config?: undefined;
}

/**
 * A single bento box in the layout.
 * Discriminated union ensures box.type and box.config.type always agree.
 */
export type BentoBox =
  | TextBentoBox
  | WeatherBentoBox
  | ForecastBentoBox
  | Forecast3DBentoBox
  | CountdownBentoBox
  | QRBentoBox
  | QuoteBentoBox
  | DateBentoBox
  | MoonBentoBox
  | SunBentoBox
  | AQIBentoBox
  | ProgressBentoBox
  | StocksBentoBox
  | HoroscopeBentoBox
  | OnThisDayBentoBox
  | UnconfiguredBentoBox;

/**
 * Default scheduled data refreshes per day (every 8h). Applied when a config
 * omits `refreshesPerDay`.
 */
export const DEFAULT_REFRESHES_PER_DAY = 3;

/**
 * Upper bound on `refreshesPerDay`. 5760/day = one refresh every ~15s
 * (86400 / 5760), the bench-testing low end of the interval. The per-device
 * pull rate limit (10/min) stays comfortably above this.
 */
export const MAX_REFRESHES_PER_DAY = 5760;

/** Full device configuration */
export interface BentoConfig {
  readonly boxes: readonly BentoBox[];
  /**
   * Times per day the display is refreshed with newly-sourced data. The
   * pull-time data-freshness bucket is `86400 / refreshesPerDay` seconds
   * (RFC 0001 §4): `1` → daily, `3` → every 8h (default), up to
   * `MAX_REFRESHES_PER_DAY` (~15s) for bench testing. `0` disables scheduled
   * refresh — the frame then changes only when the config is edited.
   */
  readonly refreshesPerDay: number;
  readonly showHeaders?: boolean;
  /** Body font size in pixels (8-42). Defaults to 20. */
  readonly fontSize?: number;
  /** Body font weight as a fraction (0.1–0.9 → Inter static weight 100–900).
   *  Defaults to 0.4 (Regular). Header/hero text renders ~3 steps heavier. */
  readonly fontWeight?: number;
  /** Corner radius level (0=square, 7=max round). Defaults to 3. */
  readonly cornerRadius?: number;
  /** Display padding level (0=none, 10=max). Defaults to 4. */
  readonly padding?: number;
  /** Override display width in pixels. Defaults to DeviceProfile / DISPLAY_WIDTH. */
  readonly width?: number;
  /** Override display height in pixels. Defaults to DeviceProfile / DISPLAY_HEIGHT. */
  readonly height?: number;
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
