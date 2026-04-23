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
  entries: z.array(ForecastEntrySchema).optional(),
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

// --- BentoBox schema ---

const BentoBoxBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  split: z.enum(['left', 'right']).optional(),
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

const BentoBoxSchema = z.discriminatedUnion('type', [
  TextBentoBoxSchema,
  WeatherBentoBoxSchema,
  ForecastBentoBoxSchema,
  CountdownBentoBoxSchema,
  QRBentoBoxSchema,
  QuoteBentoBoxSchema,
]);

// --- Full config schema ---

export const BentoConfigSchema = z.object({
  boxes: z
    .array(BentoBoxSchema)
    .min(1, 'Config must have at least one bento box')
    .max(6, 'Config cannot exceed 6 bento boxes'),
  refreshesPerDay: z.union([z.literal(1), z.literal(2)]),
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
