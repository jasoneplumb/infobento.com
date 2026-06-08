/**
 * Intent: Zod-based validation schemas for all bento box configs and full BentoConfig
 * Context: Used by API endpoints for structured field-level error responses
 * Pattern: Schemas mirror the TypeScript types in types.ts — single source of validation truth
 */

import { z } from 'zod';

// --- Box config schemas ---

const TextBoxConfigSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1, 'Text is required'),
  align: z.enum(['left', 'center']).optional(),
});

const WeatherDataSchema = z.object({
  temperature: z.number(),
  condition: z.string(),
  high: z.number(),
  low: z.number(),
});

const WeatherBoxConfigSchema = z.object({
  type: z.literal('weather'),
  city: z.string().min(1, 'City is required'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  data: WeatherDataSchema.optional(),
});

const ForecastEntrySchema = z.object({
  time: z.string(),
  temperature: z.number(),
  condition: z.string(),
});

const ForecastBoxConfigSchema = z.object({
  type: z.literal('forecast'),
  city: z.string().min(1, 'Location is required'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  hours: z.number().int().min(1).max(24).optional(),
  entries: z.array(ForecastEntrySchema).optional(),
});

const Forecast3DEntrySchema = z.object({
  day: z.string(),
  high: z.number(),
  low: z.number(),
  condition: z.string(),
});

const Forecast3DBoxConfigSchema = z.object({
  type: z.literal('forecast3d'),
  city: z.string().min(1, 'Location is required'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  days: z.number().int().min(1).max(20).optional(),
  entries: z.array(Forecast3DEntrySchema).optional(),
});

const CountdownBoxConfigSchema = z.object({
  type: z.literal('countdown'),
  targetDate: z.string().min(1, 'Target date is required'),
  label: z.string().min(1, 'Label is required'),
});

const QRBoxConfigSchema = z.object({
  type: z.literal('qr'),
  url: z.string().min(1, 'URL is required'),
});

const QuoteBoxConfigSchema = z.object({
  type: z.literal('quote'),
  text: z.string().min(1, 'Text is required'),
  author: z.string().optional(),
});

const DateBoxConfigSchema = z.object({
  type: z.literal('date'),
});

const MoonBoxConfigSchema = z.object({
  type: z.literal('moon'),
});

const SunDataSchema = z.object({
  sunrise: z.string(),
  sunset: z.string(),
  dayLength: z.string(),
});

const SunBoxConfigSchema = z.object({
  type: z.literal('sun'),
  city: z.string().min(1, 'City is required'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  data: SunDataSchema.optional(),
});

const AQIDataSchema = z.object({
  aqi: z.number(),
  category: z.string(),
  dominantPollutant: z.string(),
  uvIndex: z.number().optional(),
});

const AQIBoxConfigSchema = z.object({
  type: z.literal('aqi'),
  city: z.string().min(1, 'City is required'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  data: AQIDataSchema.optional(),
});

const ProgressBoxConfigSchema = z.object({
  type: z.literal('progress'),
  label: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const StockDataSchema = z.object({
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
});

const StockDurationSchema = z.enum(['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y']);

const StocksBoxConfigSchema = z.object({
  type: z.literal('stocks'),
  symbol: z.string().min(1, 'Symbol is required'),
  duration: StockDurationSchema.optional(),
  data: StockDataSchema.optional(),
});

const CalendarEventSchema = z.object({
  title: z.string().min(1),
  time: z.string().optional(),
});

const CalendarBoxConfigSchema = z.object({
  type: z.literal('calendar'),
  events: z.array(CalendarEventSchema).optional(),
});

const HabitEntrySchema = z.object({
  name: z.string().min(1),
  streak: z.number().int().min(0),
  completedToday: z.boolean(),
});

const HabitBoxConfigSchema = z.object({
  type: z.literal('habit'),
  habits: z.array(HabitEntrySchema).min(1, 'At least one habit is required'),
});

const HoroscopeBoxConfigSchema = z.object({
  type: z.literal('horoscope'),
  sign: z.string().min(1, 'Sign is required'),
  text: z.string().min(1, 'Text is required'),
  date: z.string().optional(),
});

const JokeBoxConfigSchema = z.object({
  type: z.literal('joke'),
  text: z.string().min(1, 'Text is required'),
  category: z.string().optional(),
});

const OnThisDayBoxConfigSchema = z.object({
  type: z.literal('onthisday'),
  text: z.string().min(1, 'Text is required'),
  year: z.string().optional(),
  category: z.string().optional(),
});

// --- BentoBox schema ---

const BentoBoxBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  split: z.enum(['left', 'right']).optional(),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  // Left-box width percent (divider position); layout clamps to 20–80. Range
  // is lenient (0–100) so legacy enum values (1/2/3) still validate.
  splitRatio: z.number().min(0).max(100).optional(),
});

const TextBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('text'),
  config: TextBoxConfigSchema.optional(),
});

const WeatherBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('weather'),
  config: WeatherBoxConfigSchema.optional(),
});

const ForecastBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('forecast'),
  config: ForecastBoxConfigSchema.optional(),
});

const Forecast3DBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('forecast3d'),
  config: Forecast3DBoxConfigSchema.optional(),
});

const CountdownBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('countdown'),
  config: CountdownBoxConfigSchema.optional(),
});

const QRBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('qr'),
  config: QRBoxConfigSchema.optional(),
});

const QuoteBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('quote'),
  config: QuoteBoxConfigSchema.optional(),
});

const DateBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('date'),
  config: DateBoxConfigSchema.optional(),
});

const MoonBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('moon'),
  config: MoonBoxConfigSchema.optional(),
});

const SunBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('sun'),
  config: SunBoxConfigSchema.optional(),
});

const AQIBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('aqi'),
  config: AQIBoxConfigSchema.optional(),
});

const ProgressBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('progress'),
  config: ProgressBoxConfigSchema.optional(),
});

const StocksBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('stocks'),
  config: StocksBoxConfigSchema.optional(),
});

const CalendarBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('calendar'),
  config: CalendarBoxConfigSchema.optional(),
});

const HabitBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('habit'),
  config: HabitBoxConfigSchema.optional(),
});

const HoroscopeBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('horoscope'),
  config: HoroscopeBoxConfigSchema.optional(),
});

const JokeBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('joke'),
  config: JokeBoxConfigSchema.optional(),
});

const OnThisDayBentoBoxSchema = BentoBoxBaseSchema.extend({
  type: z.literal('onthisday'),
  config: OnThisDayBoxConfigSchema.optional(),
});

const BentoBoxSchema = z.discriminatedUnion('type', [
  TextBentoBoxSchema,
  WeatherBentoBoxSchema,
  ForecastBentoBoxSchema,
  Forecast3DBentoBoxSchema,
  CountdownBentoBoxSchema,
  QRBentoBoxSchema,
  QuoteBentoBoxSchema,
  DateBentoBoxSchema,
  MoonBentoBoxSchema,
  SunBentoBoxSchema,
  AQIBentoBoxSchema,
  ProgressBentoBoxSchema,
  StocksBentoBoxSchema,
  CalendarBentoBoxSchema,
  HabitBentoBoxSchema,
  HoroscopeBentoBoxSchema,
  JokeBentoBoxSchema,
  OnThisDayBentoBoxSchema,
]);

// --- Full config schema ---

export const BentoConfigSchema = z.object({
  boxes: z
    .array(BentoBoxSchema)
    .min(1, 'Config must have at least one bento box')
    .max(10, 'Config cannot exceed 10 bento boxes'),
  refreshesPerDay: z.union([z.literal(1), z.literal(2)]),
  showHeaders: z.boolean().optional(),
  fontSize: z.number().int().min(8).max(42).optional(),
  cornerRadius: z.number().int().min(0).max(10).optional(),
  padding: z.number().int().min(0).max(10).optional(),
  width: z.number().int().positive().max(4096).optional(),
  height: z.number().int().positive().max(4096).optional(),
});

// --- Validation function ---

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
}

/**
 * intent: Validate a raw input against the BentoConfig schema
 * method: Uses Zod for structured parsing with field-level error paths
 * effect: Returns { valid, errors } with human-readable paths like "boxes[0].config.url"
 */
export function validateBentoConfig(input: unknown): ValidationResult {
  const result = BentoConfigSchema.safeParse(input);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path
      .map((p) => (typeof p === 'number' ? `[${String(p)}]` : String(p)))
      .join('.')
      .replace(/\.\[/g, '['),
    message: issue.message,
  }));

  return { valid: false, errors };
}
