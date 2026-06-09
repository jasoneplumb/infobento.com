import { describe, it, expect } from 'vitest';
import { validateBentoConfig } from './validation.js';

function validConfig() {
  return {
    boxes: [{ id: '1', type: 'text', label: 'Hello', config: { type: 'text', text: 'World' } }],
    refreshesPerDay: 1,
  };
}

describe('validateBentoConfig', () => {
  it('accepts a valid config', () => {
    const result = validateBentoConfig(validConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty boxes array', () => {
    const result = validateBentoConfig({ ...validConfig(), boxes: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'boxes')).toBe(true);
  });

  it('rejects invalid box config with field path', () => {
    const cfg = {
      boxes: [
        { id: '1', type: 'countdown', label: 'CD', config: { type: 'countdown', label: '' } },
      ],
      refreshesPerDay: 1,
    };
    const result = validateBentoConfig(cfg);
    expect(result.valid).toBe(false);
    // Should contain a path pointing into the box config
    expect(result.errors.some((e) => e.path.includes('boxes[0]'))).toBe(true);
  });

  it('rejects too many boxes (>10)', () => {
    const boxes = Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      type: 'text' as const,
      label: `Box ${String(i)}`,
    }));
    const result = validateBentoConfig({ ...validConfig(), boxes });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'boxes')).toBe(true);
  });

  it('accepts config with split field on boxes', () => {
    const cfg = {
      boxes: [
        { id: '1', type: 'text', label: 'Left', split: 'left' },
        { id: '2', type: 'text', label: 'Right', split: 'right' },
      ],
      refreshesPerDay: 1,
    };
    const result = validateBentoConfig(cfg);
    expect(result.valid).toBe(true);
  });

  it('rejects QR box config missing url', () => {
    const cfg = {
      boxes: [{ id: '1', type: 'qr', label: 'QR', config: { type: 'qr', url: '' } }],
      refreshesPerDay: 1,
    };
    const result = validateBentoConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('config') && e.path.includes('url'))).toBe(
      true,
    );
  });

  it('accepts fontWeight at every valid 0.1 step', () => {
    for (const fontWeight of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      expect(validateBentoConfig({ ...validConfig(), fontWeight }).valid).toBe(true);
    }
  });

  it('rejects fontWeight off the 0.1 step grid or out of range', () => {
    for (const fontWeight of [0.15, 0.27, 0, 1, -0.1]) {
      expect(validateBentoConfig({ ...validConfig(), fontWeight }).valid).toBe(false);
    }
  });
});
