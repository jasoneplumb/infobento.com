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

  it('accepts the full refreshesPerDay range (0, default 3, max 5760)', () => {
    for (const n of [0, 3, 5760]) {
      const result = validateBentoConfig({ ...validConfig(), refreshesPerDay: n });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects out-of-range or non-integer refreshesPerDay', () => {
    for (const n of [-1, 5761, 2.5]) {
      const result = validateBentoConfig({ ...validConfig(), refreshesPerDay: n });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'refreshesPerDay')).toBe(true);
    }
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

describe('holidays box config', () => {
  function holidaysConfig(config: Record<string, unknown>) {
    return {
      boxes: [{ id: '1', type: 'holidays', label: 'Holidays', config }],
      refreshesPerDay: 1,
    };
  }

  const withData = (date: string) => ({
    type: 'holidays',
    countryCode: 'GB',
    data: { name: 'Christmas Day', date },
  });

  it('accepts a well-formed holidays box', () => {
    const result = validateBentoConfig(holidaysConfig(withData('2026-12-25')));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a holidays box with no fetched data yet', () => {
    expect(validateBentoConfig(holidaysConfig({ type: 'holidays', countryCode: 'GB' })).valid).toBe(
      true,
    );
  });

  // A non-ISO date survives the fetcher's truthy-only guard, reaches the DB,
  // and makes the renderer's countdown NaN. Reject it at the schema layer.
  // The ISO *shape* alone is not enough: "2026-13-99" matches it but parses to
  // Invalid Date (a permanent "Today" hero), and "2026-02-30" silently rolls
  // over to March 2 and counts down to the wrong day.
  it.each(['2026-13-99', '2026-02-30', '2026-00-10', '2026-01-32', '0000-01-01'])(
    'rejects the ISO-shaped but non-calendar date %o',
    (date) => {
      const result = validateBentoConfig(holidaysConfig(withData(date)));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.endsWith('data.date'))).toBe(true);
    },
  );

  it.each(['2026-12-25', '2024-02-29', '2026-01-01', '2026-12-31'])(
    'accepts the real calendar date %o',
    (date) => {
      expect(validateBentoConfig(holidaysConfig(withData(date))).valid).toBe(true);
    },
  );

  it.each(['not-a-date', '2026/12/25', '25-12-2026', '2026-12-25T00:00:00Z', ''])(
    'rejects the malformed date %o',
    (date) => {
      const result = validateBentoConfig(holidaysConfig(withData(date)));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.endsWith('data.date'))).toBe(true);
    },
  );

  // countryCode is interpolated into the Nager.Date request path, so anything
  // containing '/', '.' or '?' can steer the request to a different endpoint.
  it.each(['GB/../../v2/Other', 'GB/', '../etc', 'G', 'GBR', '', 'G1', 'gb?x=1', 'G B'])(
    'rejects the unsafe or malformed country code %o',
    (countryCode) => {
      const result = validateBentoConfig(holidaysConfig({ type: 'holidays', countryCode }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.endsWith('countryCode'))).toBe(true);
    },
  );

  // Case-insensitive by design: every consumer uppercases before use, so
  // rejecting "gb" would break direct API callers without buying any safety.
  it.each(['GB', 'gb', 'Gb'])('accepts the 2-letter country code %o', (countryCode) => {
    expect(validateBentoConfig(holidaysConfig({ type: 'holidays', countryCode })).valid).toBe(true);
  });
});
