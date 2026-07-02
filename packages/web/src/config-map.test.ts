/**
 * Round-trip coverage for the editor↔core config mapping (issue #76). The cloud
 * persistence path relies on fromBentoBox being a faithful inverse of toBentoBox
 * for the field-name translations (text↔content, targetDate↔date,
 * label↔progressLabel, …); these tests pin those down.
 */

import { describe, it, expect } from 'vitest';
import type { BentoConfig } from '@infobento/core';
import { validateBentoConfig } from '@infobento/core';
import type { EditorBox } from './state';
import { toBentoBox, fromBentoBox, fromBentoConfig, toBentoConfig } from './config-map';

/** editor box → core box → editor export box, returning the export config. */
function roundTrip(box: EditorBox): ReturnType<typeof fromBentoBox> {
  return fromBentoBox(toBentoBox(box));
}

describe('toBentoBox / fromBentoBox round-trip', () => {
  it('text: content ↔ text', () => {
    const out = roundTrip({ id: 1, type: 'text', label: 'Note', config: { content: 'hello' } });
    expect(out).toMatchObject({ type: 'text', label: 'Note', config: { content: 'hello' } });
  });

  it('countdown: date/countdownLabel ↔ targetDate/label', () => {
    const out = roundTrip({
      id: 2,
      type: 'countdown',
      label: 'Trip',
      config: { date: '2026-12-31', countdownLabel: 'New Year' },
    });
    expect(out.config).toEqual({ date: '2026-12-31', countdownLabel: 'New Year' });
  });

  it('progress: progressLabel ↔ label', () => {
    const out = roundTrip({
      id: 3,
      type: 'progress',
      label: 'Year',
      config: { progressLabel: 'Year', startDate: '2026-01-01', endDate: '2026-12-31' },
    });
    expect(out.config).toEqual({
      progressLabel: 'Year',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });

  it('quote: content/author ↔ text/author', () => {
    const out = roundTrip({
      id: 4,
      type: 'quote',
      label: 'Quote',
      config: { content: 'Be excellent', author: 'Bill' },
    });
    expect(out.config).toEqual({ content: 'Be excellent', author: 'Bill' });
  });

  it('quote: persists the tag filter so pull-time refresh keeps the steer', () => {
    const out = roundTrip({
      id: 41,
      type: 'quote',
      label: 'Quote',
      config: { content: 'Be excellent', author: 'Bill', tags: 'wisdom, life' },
    });
    expect(out.config).toMatchObject({ tags: 'wisdom, life' });
  });

  it('joke: persists the categories filter (distinct from the returned category)', () => {
    const out = roundTrip({
      id: 42,
      type: 'joke',
      label: 'Joke',
      config: {
        content: 'A byte walks into a bar',
        category: 'Programming',
        categories: 'Programming, Pun',
      },
    });
    expect(out.config).toMatchObject({ categories: 'Programming, Pun' });
  });

  it('preserves split layout markers (side + non-default ratio)', () => {
    const out = roundTrip({
      id: 5,
      type: 'weather',
      label: 'Weather',
      config: { city: 'Portland' },
      split: 'left',
      splitRatio: 35,
    });
    expect(out.split).toBe('left');
    expect(out.splitRatio).toBe(35);
    expect(out.config).toMatchObject({ city: 'Portland' });
  });
});

describe('toBentoConfig (export = drop-in device config)', () => {
  it('emits a valid BentoConfig with width/height from the active device profile', () => {
    const cfg = toBentoConfig([{ id: 1, type: 'text', label: 'Note', config: { content: 'hi' } }]);
    // Dimensions must be present — their absence is what garbles the panel
    // (renderer falls back to the default resolution at a different stride).
    expect(typeof cfg.width).toBe('number');
    expect(typeof cfg.height).toBe('number');
    expect(cfg.width).toBeGreaterThan(0);
    expect(cfg.height).toBeGreaterThan(0);
    // And the whole thing must pass the same validation the device applies.
    expect(validateBentoConfig(cfg).valid).toBe(true);
  });

  it('emits refreshesPerDay from editor state (default 3 = every 8h)', () => {
    const cfg = toBentoConfig([{ id: 1, type: 'text', label: 'Note', config: { content: 'hi' } }]);
    expect(cfg.refreshesPerDay).toBe(3);
  });

  // Regression: the date case referenced an undefined `box` (should be `editor`),
  // which threw `ReferenceError: box is not defined` inside toBentoConfig whenever
  // a date box was present — aborting the editor's preview render entirely (#168).
  it('date box: exports without throwing, with and without a location', () => {
    const plain = toBentoConfig([{ id: 1, type: 'date', label: 'Date', config: {} }]);
    expect(plain.boxes[0]).toMatchObject({ type: 'date', config: { type: 'date' } });
    expect((plain.boxes[0]?.config as { city?: string }).city).toBeUndefined();
    expect(validateBentoConfig(plain).valid).toBe(true);

    const located = toBentoConfig([
      { id: 1, type: 'date', label: 'Date', config: { city: 'Beaverton, Oregon' } },
    ]);
    expect(located.boxes[0]).toMatchObject({
      type: 'date',
      config: { type: 'date', city: 'Beaverton, Oregon' },
    });
    expect(validateBentoConfig(located).valid).toBe(true);
  });
});

describe('fromBentoConfig', () => {
  it('emits the version-2 export shape with style fields carried over', () => {
    const core: BentoConfig = {
      boxes: [{ id: '1', label: 'Note', type: 'text', config: { type: 'text', text: 'hi' } }],
      refreshesPerDay: 96,
      showHeaders: true,
      fontSize: 30,
      fontWeight: 0.5,
      cornerRadius: 2,
      padding: 6,
    };
    const out = fromBentoConfig(core);
    expect(out.version).toBe(2);
    expect(out.boxes).toHaveLength(1);
    expect(out.boxes[0]).toMatchObject({ type: 'text', label: 'Note', config: { content: 'hi' } });
    expect(out).toMatchObject({
      showHeaders: true,
      fontSize: 30,
      fontWeight: 0.5,
      cornerRadius: 2,
      padding: 6,
      refreshesPerDay: 96,
    });
  });
});
