/**
 * Intent: Stateless pure-function API for generating eInk display frames
 * Context: Called by the device (via phone bridge) to get updated display data
 * Pattern: Pure functions — no server state, edge-deployable
 * Future: Add Hono server, POST /render, POST /preview, GET /box-types endpoints
 */

import type { BentoConfig } from '@infobento/core';
import type { FrameBuffer } from '@infobento/renderer';
import { render } from '@infobento/renderer';

/**
 * intent: Generate a frame buffer from a bento configuration
 * method: Delegates to renderer — this is the API's core pure function
 * effect: Returns device-ready binary data with no side effects
 */
export function generateFrame(config: BentoConfig): FrameBuffer {
  return render(config);
}

/** Validate a bento configuration without rendering */
export function validateConfig(config: BentoConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.boxes.length === 0) {
    errors.push('Config must have at least one bento box');
  }

  if (config.boxes.length > 6) {
    errors.push('Config cannot exceed 6 bento boxes');
  }

  return { valid: errors.length === 0, errors };
}
