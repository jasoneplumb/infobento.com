import { describe, it, expect } from 'vitest';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, DEFAULT_DEVICE } from './index.js';

describe('core constants', () => {
  it('should define display dimensions', () => {
    expect(DISPLAY_WIDTH).toBe(240);
    expect(DISPLAY_HEIGHT).toBe(200);
  });

  it('should define default device profile', () => {
    expect(DEFAULT_DEVICE.widthPx).toBe(240);
    expect(DEFAULT_DEVICE.heightPx).toBe(200);
    expect(DEFAULT_DEVICE.deviceId).toBe('infobento-2.9');
  });
});
