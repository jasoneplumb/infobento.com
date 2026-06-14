/**
 * Round-trip coverage for the editor↔core config mapping (issue #76). The cloud
 * persistence path relies on fromBentoBox being a faithful inverse of toBentoBox
 * for the field-name translations (text↔content, targetDate↔date,
 * label↔progressLabel, …); these tests pin those down.
 */

import { describe, it, expect } from 'vitest';
import type { BentoConfig } from '@infobento/core';
import type { EditorBox } from './state';
import { toBentoBox, fromBentoBox, fromBentoConfig } from './config-map';

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

describe('fromBentoConfig', () => {
  it('emits the version-2 export shape with style fields carried over', () => {
    const core: BentoConfig = {
      boxes: [{ id: '1', label: 'Note', type: 'text', config: { type: 'text', text: 'hi' } }],
      refreshesPerDay: 1,
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
    });
  });
});
