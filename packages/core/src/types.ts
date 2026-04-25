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

/** Single entry in a 3-hour forecast — time label + temperature + condition */
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
}

export interface DateBoxConfig {
  readonly type: 'date';
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

/** Single entry in a 3-day daily forecast — day label + high/low + condition */
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
  readonly entries?: readonly Forecast3DEntry[];
}

/** Pre-fetched stock/crypto data — the renderer never fetches, only displays */
export interface StockData {
  readonly price: number;
  readonly change: number; // absolute change
  readonly changePercent: number; // percentage change
}

export interface StocksBoxConfig {
  readonly type: 'stocks';
  readonly symbol: string; // e.g. 'AAPL', 'BTC'
  readonly data?: StockData;
}

/** A single task item with completion state */
export interface TaskItem {
  readonly text: string;
  readonly done: boolean;
}

export interface TasksBoxConfig {
  readonly type: 'tasks';
  readonly items: readonly TaskItem[];
}

/** Pre-fetched calendar event data */
export interface CalendarEvent {
  readonly title: string;
  readonly time?: string; // e.g. '14:00' or 'All day'
}

export interface CalendarBoxConfig {
  readonly type: 'calendar';
  readonly events?: readonly CalendarEvent[];
}

/** Habit tracking entry with streak info */
export interface HabitEntry {
  readonly name: string;
  readonly streak: number; // consecutive days
  readonly completedToday: boolean;
}

export interface HabitBoxConfig {
  readonly type: 'habit';
  readonly habits: readonly HabitEntry[];
}

/** Pre-fetched joke text from a category-filtered API */
export interface JokeBoxConfig {
  readonly type: 'joke';
  readonly text: string; // the joke body (single-line; multi-line jokes normalized server-side)
  readonly category?: string; // the API-returned category (e.g. 'Programming', 'Pun')
}

/** Pre-fetched horoscope reading for a single zodiac sign */
export interface HoroscopeBoxConfig {
  readonly type: 'horoscope';
  readonly sign: string; // e.g. 'aries' (lowercase)
  readonly text: string; // the reading body
  readonly date?: string; // ISO date the reading is for
}

/** A timezone entry for world clock display */
export interface ClockZone {
  readonly label: string; // e.g. 'Tokyo', 'NYC'
  readonly offsetMinutes: number; // UTC offset in minutes, e.g. -300 for EST
}

export interface WorldclockBoxConfig {
  readonly type: 'worldclock';
  readonly zones: readonly ClockZone[];
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
  | TasksBoxConfig
  | CalendarBoxConfig
  | HabitBoxConfig
  | WorldclockBoxConfig
  | HoroscopeBoxConfig
  | JokeBoxConfig;

// --- Core types ---

/** Types of information a bento box can display */
export type BentoBoxType =
  | 'weather'
  | 'forecast'
  | 'forecast3d'
  | 'calendar'
  | 'tasks'
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
  | 'habit'
  | 'worldclock'
  | 'horoscope'
  | 'joke';

/** Base fields shared by all bento boxes */
interface BentoBoxBase {
  readonly id: string;
  readonly label: string;
  /** Optional horizontal subdivision — 'left' and 'right' boxes share a row */
  readonly split?: 'left' | 'right';
  /** Relative height weight (1=compact, 2=normal, 3=tall). Defaults to 2. */
  readonly weight?: 1 | 2 | 3;
  /** Left box width ratio in a split pair (1=narrow, 2=equal, 3=wide). Defaults to 2. */
  readonly splitRatio?: 1 | 2 | 3;
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

/** Forecast box (3-hour) with typed config */
interface ForecastBentoBox extends BentoBoxBase {
  readonly type: 'forecast';
  readonly config?: ForecastBoxConfig;
}

/** 3-day forecast box with typed config */
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

/** Tasks box with typed config */
interface TasksBentoBox extends BentoBoxBase {
  readonly type: 'tasks';
  readonly config?: TasksBoxConfig;
}

/** Calendar box with typed config */
interface CalendarBentoBox extends BentoBoxBase {
  readonly type: 'calendar';
  readonly config?: CalendarBoxConfig;
}

/** Habit box with typed config */
interface HabitBentoBox extends BentoBoxBase {
  readonly type: 'habit';
  readonly config?: HabitBoxConfig;
}

/** World clock box with typed config */
interface WorldclockBentoBox extends BentoBoxBase {
  readonly type: 'worldclock';
  readonly config?: WorldclockBoxConfig;
}

/** Horoscope box with typed config */
interface HoroscopeBentoBox extends BentoBoxBase {
  readonly type: 'horoscope';
  readonly config?: HoroscopeBoxConfig;
}

/** Joke box with typed config */
interface JokeBentoBox extends BentoBoxBase {
  readonly type: 'joke';
  readonly config?: JokeBoxConfig;
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
    | 'tasks'
    | 'calendar'
    | 'habit'
    | 'worldclock'
    | 'horoscope'
    | 'joke'
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
  | TasksBentoBox
  | CalendarBentoBox
  | HabitBentoBox
  | WorldclockBentoBox
  | HoroscopeBentoBox
  | JokeBentoBox
  | UnconfiguredBentoBox;

/** Full device configuration */
export interface BentoConfig {
  readonly boxes: readonly BentoBox[];
  readonly refreshesPerDay: 1 | 2;
  readonly showHeaders?: boolean;
  /** Body font size in pixels (8-42). Defaults to 20. */
  readonly fontSize?: number;
  /** Corner radius level (0=square, 10=max round). Defaults to 3. */
  readonly cornerRadius?: number;
  /** Display padding level (0=none, 10=max). Defaults to 4. */
  readonly padding?: number;
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
