import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from '../index.js';
import { renderCalendarBox } from './calendar.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { BentoConfig, LayoutBox, CalendarBoxConfig } from '@infobento/core';

/** Count number of set bits in a byte */
function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

const metrics = computeFontMetrics();

describe('renderCalendarBox', () => {
  function makeLayout(config: CalendarBoxConfig, label = 'Today'): LayoutBox {
    return {
      box: {
        id: 'cal-1',
        type: 'calendar' as const,
        label,
        config,
      },
      x: 0,
      y: 0,
      width: 460,
      height: 300,
    };
  }

  it('renders with multiple events (some with time, some without)', () => {
    const config: CalendarBoxConfig = {
      type: 'calendar',
      events: [
        { title: 'Team standup', time: '09:00' },
        { title: 'Lunch break' },
        { title: 'Design review', time: '14:00' },
        { title: 'All day workshop', time: 'All day' },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderCalendarBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with no events (shows "No events")', () => {
    const config: CalendarBoxConfig = {
      type: 'calendar',
      events: [],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderCalendarBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with no events property (undefined)', () => {
    const config: CalendarBoxConfig = {
      type: 'calendar',
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderCalendarBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with a single event', () => {
    const config: CalendarBoxConfig = {
      type: 'calendar',
      events: [{ title: 'Dentist appointment', time: '10:30' }],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderCalendarBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches correctly through render()', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'calendar',
          label: 'Today',
          config: {
            type: 'calendar',
            events: [{ title: 'Meeting', time: '09:00' }, { title: 'Gym' }],
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('does not crash with zero-size layout', () => {
    const config: CalendarBoxConfig = {
      type: 'calendar',
      events: [{ title: 'Test', time: '12:00' }],
    };
    const layout: LayoutBox = {
      box: { id: 'cal-z', type: 'calendar' as const, label: 'Cal', config },
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    const fb = createFrameBuffer({ widthPx: 0, heightPx: 0, deviceId: '' });
    expect(() => renderCalendarBox(fb, layout, config, metrics)).not.toThrow();
  });
});
