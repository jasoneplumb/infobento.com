import { describe, it, expect } from 'vitest';
import { moonPhase, moonPhaseName, renderMoonBox } from './moon.js';
import { createFrameBuffer, render } from '../index.js';
import type { LayoutBox, MoonBoxConfig, BentoConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: MoonBoxConfig): LayoutBox {
  return {
    box: { id: 'moon-1', type: 'moon' as const, label: 'Moon', config },
    x: 0,
    y: 0,
    width: 120,
    height: 100,
  };
}

describe('moonPhase', () => {
  it('returns 0 for the reference epoch (new moon)', () => {
    const epoch = new Date('2000-01-06T18:14:00Z');
    const phase = moonPhase(epoch);
    expect(phase).toBeCloseTo(0, 3);
  });

  it('returns approximately 0.5 for a known full moon', () => {
    // Full moon ~14.77 days after new moon — Jan 21, 2000
    const fullMoonDate = new Date('2000-01-21T04:41:00Z');
    const phase = moonPhase(fullMoonDate);
    expect(phase).toBeGreaterThan(0.45);
    expect(phase).toBeLessThan(0.55);
  });

  it('returns a value between 0 and 1 for any date', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-04-15'),
      new Date('2026-07-04'),
      new Date('2026-12-25'),
    ];
    for (const d of dates) {
      const p = moonPhase(d);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('moonPhaseName', () => {
  it('returns New Moon at phase 0', () => {
    const { name, index } = moonPhaseName(0);
    expect(name).toBe('New Moon');
    expect(index).toBe(0);
  });

  it('returns Full Moon at phase 0.5', () => {
    const { name, index } = moonPhaseName(0.5);
    expect(name).toBe('Full Moon');
    expect(index).toBe(4);
  });

  it('returns First Quarter at phase 0.25', () => {
    const { name, index } = moonPhaseName(0.25);
    expect(name).toBe('First Quarter');
    expect(index).toBe(2);
  });

  it('returns Last Quarter at phase 0.75', () => {
    const { name, index } = moonPhaseName(0.75);
    expect(name).toBe('Last Quarter');
    expect(index).toBe(6);
  });

  it('returns Waxing Crescent at phase 0.125', () => {
    const { name } = moonPhaseName(0.125);
    expect(name).toBe('Waxing Crescent');
  });

  it('returns Waxing Gibbous at phase 0.375', () => {
    const { name } = moonPhaseName(0.375);
    expect(name).toBe('Waxing Gibbous');
  });

  it('returns Waning Gibbous at phase 0.625', () => {
    const { name } = moonPhaseName(0.625);
    expect(name).toBe('Waning Gibbous');
  });

  it('returns Waning Crescent at phase 0.875', () => {
    const { name } = moonPhaseName(0.875);
    expect(name).toBe('Waning Crescent');
  });

  it('returns illumination 0 at new moon', () => {
    const { illumination } = moonPhaseName(0);
    expect(illumination).toBe(0);
  });

  it('returns illumination 100 at full moon', () => {
    const { illumination } = moonPhaseName(0.5);
    expect(illumination).toBe(100);
  });
});

describe('renderMoonBox', () => {
  it('renders with default config', () => {
    const config: MoonBoxConfig = { type: 'moon' };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderMoonBox(fb, makeLayout(config), config, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without crashing for all 8 phases', { timeout: 30000 }, () => {
    const config: MoonBoxConfig = { type: 'moon' };
    // Use dates that produce each of the 8 phase indices
    const synodic = 29.53059;
    const epochMs = Date.UTC(2000, 0, 6, 18, 14, 0);

    for (let phaseIdx = 0; phaseIdx < 8; phaseIdx++) {
      // Target the middle of each phase segment
      const targetFraction = (phaseIdx + 0.5) / 8;
      const offsetDays = targetFraction * synodic;
      const date = new Date(epochMs + offsetDays * 86400000);

      const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
      renderMoonBox(fb, makeLayout(config), config, date);
      const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
      expect(totalSet).toBeGreaterThan(0);
    }
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [{ id: '1', type: 'moon', label: 'Moon', config: { type: 'moon' } }],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
