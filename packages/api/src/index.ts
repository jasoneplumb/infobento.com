/**
 * Intent: Stateless pure-function API for generating eInk display frames
 * Context: Called by the device (via phone bridge) to get updated display data
 * Pattern: Pure functions — no server state, edge-deployable
 * Future: Add data source fetchers for weather, quotes, etc.
 */

import type { BentoConfig } from '@infobento/core';
import { validateBentoConfig } from '@infobento/core';
import type { ValidationResult } from '@infobento/core';
import type { FrameBuffer } from '@infobento/renderer';
import { render, frameToPng } from '@infobento/renderer';

// Re-export frameToPng for API consumers (also available from @infobento/renderer for web)
export { frameToPng } from '@infobento/renderer';

// Re-export validation types for API consumers
export { validateBentoConfig } from '@infobento/core';
export type { ValidationResult, ValidationError } from '@infobento/core';

/**
 * intent: Generate a frame buffer from a bento configuration
 * method: Delegates to renderer — this is the API's core pure function
 * effect: Returns device-ready binary data with no side effects
 */
export function generateFrame(config: BentoConfig): FrameBuffer {
  return render(config);
}

/** Generate a PNG preview image from a bento configuration */
export function generatePreview(config: BentoConfig, scale = 3): Uint8Array {
  const fb = render(config);
  return frameToPng(fb, scale);
}

/** Validate a bento configuration using Zod schema validation */
export function validateConfig(input: unknown): ValidationResult {
  return validateBentoConfig(input);
}
