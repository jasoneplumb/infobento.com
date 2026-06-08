/**
 * Intent: Stateless pure-function API for generating eInk display frames
 * Context: Called by the device (via phone bridge) to get updated display data
 * Pattern: Pure functions — no server state, edge-deployable
 */

import type { BentoConfig } from '@infobento/core';
import { validateBentoConfig } from '@infobento/core';
import type { ValidationResult } from '@infobento/core';
import type { FrameBuffer, DualRenderResult } from '@infobento/renderer';
import { render, renderBoth, renderBothBoxIds, frameToPng } from '@infobento/renderer';

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

/** Both landscape and portrait frame buffers in one call */
export function generateDualFrame(config: BentoConfig): DualRenderResult {
  return renderBoth(config);
}

/**
 * Both landscape and portrait PNG previews in one call, plus the box ids that
 * actually render in each orientation (the rest were dropped — don't fit), so
 * the editor can show which boxes made it onto the panel.
 */
export function generateDualPreview(
  config: BentoConfig,
  scale = 3,
): {
  landscape: Uint8Array;
  portrait: Uint8Array;
  landscapeIds: string[];
  portraitIds: string[];
} {
  const dual = renderBoth(config);
  const ids = renderBothBoxIds(config);
  return {
    landscape: frameToPng(dual.landscape, scale),
    portrait: frameToPng(dual.portrait, scale),
    landscapeIds: ids.landscape,
    portraitIds: ids.portrait,
  };
}

/** Validate a bento configuration using Zod schema validation */
export function validateConfig(input: unknown): ValidationResult {
  return validateBentoConfig(input);
}
