import { describe, it, expect } from 'vitest';
import { validateBentoConfig } from './validation.js';

function validConfig() {
  return {
    displayId: 'D',
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

  it('rejects missing displayId with path', () => {
    const { displayId: _, ...noId } = validConfig();
    const result = validateBentoConfig(noId);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'displayId')).toBe(true);
  });

  it('rejects empty boxes array', () => {
    const result = validateBentoConfig({ ...validConfig(), boxes: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'boxes')).toBe(true);
  });

  it('rejects invalid box config with field path', () => {
    const cfg = {
      displayId: 'D',
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

  it('rejects too many boxes (>6)', () => {
    const boxes = Array.from({ length: 7 }, (_, i) => ({
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
      displayId: 'D',
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
      displayId: 'D',
      boxes: [{ id: '1', type: 'qr', label: 'QR', config: { type: 'qr', url: '' } }],
      refreshesPerDay: 1,
    };
    const result = validateBentoConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('config') && e.path.includes('url'))).toBe(
      true,
    );
  });
});
