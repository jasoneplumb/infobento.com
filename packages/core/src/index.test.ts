import { describe, it, expect } from 'vitest';
import {
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  DEFAULT_DEVICE,
  DEFAULT_FRAME_BYTES,
  frameBufferBytes,
} from './index.js';

// Pinned values — change here when the hardware spec changes.
const EXPECTED_WIDTH = 240;
const EXPECTED_HEIGHT = 200;

describe('core constants', () => {
  it('should match the hardware spec', () => {
    expect(DISPLAY_WIDTH).toBe(EXPECTED_WIDTH);
    expect(DISPLAY_HEIGHT).toBe(EXPECTED_HEIGHT);
  });

  it('should define default device profile from display dimensions', () => {
    expect(DEFAULT_DEVICE.widthPx).toBe(DISPLAY_WIDTH);
    expect(DEFAULT_DEVICE.heightPx).toBe(DISPLAY_HEIGHT);
    expect(DEFAULT_DEVICE.deviceId).toBe('infobento-2.9');
  });

  it('derives frame buffer byte size from dimensions', () => {
    expect(frameBufferBytes(8, 1)).toBe(1);
    expect(frameBufferBytes(9, 1)).toBe(2); // rounds up to next byte
    expect(DEFAULT_FRAME_BYTES).toBe(frameBufferBytes(DISPLAY_WIDTH, DISPLAY_HEIGHT));
  });
});
