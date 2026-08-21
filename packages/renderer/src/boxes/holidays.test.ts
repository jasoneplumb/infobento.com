import { describe, it, expect } from 'vitest';
import type { TestContext } from 'vitest';
import { createFrameBuffer } from '../index.js';
import { renderHolidaysBox, daysUntilHoliday } from './holidays.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { LayoutBox, HolidaysBoxConfig } from '@infobento/core';

const W = 100;
const H = 120;
const M = computeFontMetrics();
const BYTE_W = Math.ceil(W / 4);

function makeLayout(config: HolidaysBoxConfig, y = 0): LayoutBox {
  return {
    box: { id: 'h-1', type: 'holidays' as const, label: 'Holidays', config },
    x: 0,
    y,
    width: W,
    height: H,
  };
}

function inkIn(data: Uint8Array, from: number, to: number): number {
  let n = 0;
  for (let r = from; r < to; r++) {
    for (let b = 0; b < BYTE_W; b++) {
      const v = data[r * BYTE_W + b] ?? 0;
      for (let shift = 0; shift < 8; shift += 2) {
        if (((v >> shift) & 3) !== 0) n++;
      }
    }
  }
  return n;
}

/**
 * Render into a buffer taller than the box and return just the box's rows.
 *
 * The offset is the point: at y = 0 a bug that uses a relative delta where an
 * absolute coordinate belongs is invisible, because `delta === y + delta`.
 * Slicing back to H rows keeps the `inkIn(data, 0, H)` calls below unchanged.
 */
const Y_OFFSET = 40;

function render(config: HolidaysBoxConfig, now?: Date): Uint8Array {
  const fb = createFrameBuffer({ widthPx: W, heightPx: Y_OFFSET + H, deviceId: '' });
  renderHolidaysBox(fb, makeLayout(config, Y_OFFSET), config, M, now, false);
  // Nothing may be drawn above the box.
  expect(inkIn(fb.data, 0, Y_OFFSET)).toBe(0);
  return fb.data.slice(Y_OFFSET * BYTE_W);
}

describe('daysUntilHoliday', () => {
  it('returns the number of whole days until a future date', () => {
    const now = new Date('2026-08-20T12:00:00');
    expect(daysUntilHoliday('2026-08-31', now)).toBe(11);
  });

  it('returns 0 for today', () => {
    const now = new Date('2026-08-31T09:00:00');
    expect(daysUntilHoliday('2026-08-31', now)).toBe(0);
  });

  it('returns 0 for past dates, not a negative', () => {
    const now = new Date('2026-09-01T00:00:00');
    expect(daysUntilHoliday('2026-08-31', now)).toBe(0);
  });

  // Regression: `Math.max(0, NaN)` is NaN, not 0 — NaN propagates through
  // Math.max instead of comparing as less-than-zero. Without an explicit guard
  // a malformed date reaches renderHolidaysBox and draws the string "NaN".
  it.each(['not-a-date', '', '2026/12/25', '2026-99-99', 'Dec 25 2026'])(
    'returns 0 (never NaN) for the malformed date %o',
    (bad) => {
      const days = daysUntilHoliday(bad, new Date('2026-08-20T12:00:00'));
      expect(Number.isNaN(days)).toBe(false);
      expect(days).toBe(0);
    },
  );

  // Regression: DST fall-back. Both operands are local-midnight timestamps, so
  // the night the clocks go back spans 25 wall-clock hours and
  // Math.ceil(25/24) === 2 — a holiday one day away would display as "2 days".
  // Math.round(25/24) === 1. The test pins TZ itself so it is deterministic
  // regardless of the machine's zone.
  describe('across DST transitions', () => {
    const withTz = (ctx: TestContext, tz: string, fn: () => void): void => {
      const prev = process.env['TZ'];
      process.env['TZ'] = tz;
      try {
        // A mid-process TZ mutation is not guaranteed to flush the ICU timezone
        // cache (notably on small-icu Node builds). If it silently no-ops on a
        // UTC host, every night below is exactly 24 h, Math.round and Math.ceil
        // agree, and these assertions would hold even with the bug reintroduced.
        //
        // Skip rather than fail on such a host: a red build would be an
        // infrastructure error, not a defect, but a silent pass would be a lie.
        // A skip is visible in the report and is honest about what was checked.
        const winter = new Date(2026, 0, 15).getTimezoneOffset();
        const summer = new Date(2026, 6, 15).getTimezoneOffset();
        if (winter === summer) {
          ctx.skip(`TZ=${tz} did not take effect on this host; DST checks would be vacuous`);
          return;
        }
        fn();
      } finally {
        if (prev === undefined) delete process.env['TZ'];
        else process.env['TZ'] = prev;
      }
    };

    /** Wall-clock hours between two consecutive local midnights. */
    const nightLength = (y: number, m: number, d: number, next: string): number =>
      (new Date(next + 'T00:00:00').getTime() - new Date(y, m, d).getTime()) / 3_600_000;

    // Fall-back happens at 02:00 *on* 2026-11-01, so the 25-hour night is the
    // one from local midnight Nov 1 to local midnight Nov 2 (verified 25 h).
    // Math.ceil(25/24) = 2; the correct answer is 1.
    it('counts a 25-hour night as 1 day, not 2 (fall back)', (ctx) => {
      withTz(ctx, 'America/New_York', () => {
        // Pin the premise: this really is the 25 h night, not a 24 h one.
        expect(nightLength(2026, 10, 1, '2026-11-02')).toBe(25);
        const now = new Date(2026, 10, 1, 12, 0, 0); // Sun 2026-11-01 local
        expect(daysUntilHoliday('2026-11-02', now)).toBe(1);
      });
    });

    // Spring-forward at 02:00 on 2026-03-08 makes Mar 8 -> Mar 9 a 23 h night.
    // Both ceil and round answer 1 here, so this does not catch the original
    // bug — it pins the other DST direction so a future "fix" that swaps in
    // Math.floor (which would answer 0) cannot pass.
    it('counts a 23-hour night as 1 day (spring forward)', (ctx) => {
      withTz(ctx, 'America/New_York', () => {
        expect(nightLength(2026, 2, 8, '2026-03-09')).toBe(23);
        const now = new Date(2026, 2, 8, 12, 0, 0); // Sun 2026-03-08 local
        expect(daysUntilHoliday('2026-03-09', now)).toBe(1);
      });
    });

    it('stays exact across a multi-week span containing a fall-back', (ctx) => {
      withTz(ctx, 'America/New_York', () => {
        // 769 h apart (32 days + the extra fall-back hour): ceil gives 33.
        const now = new Date(2026, 9, 25, 8, 0, 0); // 2026-10-25
        expect(daysUntilHoliday('2026-11-26', now)).toBe(32); // Thanksgiving
      });
    });
  });
});

describe('renderHolidaysBox', () => {
  it('renders a reading with day count and holiday name', () => {
    const now = new Date('2026-08-20T00:00:00');
    const data = render(
      {
        type: 'holidays',
        countryCode: 'GB',
        data: { name: 'Summer Bank Holiday', date: '2026-08-31' },
      },
      now,
    );
    expect(inkIn(data, 0, H)).toBeGreaterThan(0);
  });

  it('renders the "Today" state when the holiday is today', () => {
    const now = new Date('2026-08-31T00:00:00');
    const data = render(
      {
        type: 'holidays',
        countryCode: 'GB',
        data: { name: 'Summer Bank Holiday', date: '2026-08-31' },
      },
      now,
    );
    expect(inkIn(data, 0, H)).toBeGreaterThan(0);
  });

  // A malformed date must not reach drawHeroText as the literal string "NaN".
  // Rendering at a non-zero y so any height/overdraw regression surfaces too.
  it('renders the "Today" state rather than "NaN" for a malformed date', () => {
    const config: HolidaysBoxConfig = {
      type: 'holidays',
      countryCode: 'GB',
      data: { name: 'Broken Holiday', date: 'not-a-date' },
    };
    const OFFSET = 200;
    const TALL = OFFSET + H;
    const fb = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
    renderHolidaysBox(fb, makeLayout(config, OFFSET), config, M, undefined, false);

    // Same pixels as the genuine 0-day "Today" render — i.e. the NaN branch was
    // never taken. A String(NaN) hero would differ.
    const today: HolidaysBoxConfig = {
      type: 'holidays',
      countryCode: 'GB',
      data: { name: 'Broken Holiday', date: '2026-08-31' },
    };
    const ref = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
    renderHolidaysBox(
      ref,
      makeLayout(today, OFFSET),
      today,
      M,
      new Date('2026-08-31T09:00:00'),
      false,
    );

    expect(Array.from(fb.data)).toEqual(Array.from(ref.data));
  });

  // When the box is too short for the hero, the hero is skipped — but the
  // holiday name must still render. Advancing cy past the (undrawn) hero would
  // push it beyond contentEnd and silently drop the name as well, leaving a
  // box that is short but not empty rendering nothing at all.
  it('still draws the holiday name when the hero does not fit', () => {
    const config: HolidaysBoxConfig = {
      type: 'holidays',
      countryCode: 'GB',
      data: { name: 'Christmas Day', date: '2026-12-25' },
    };
    const OFFSET = 40;
    // Sized into the window where the hero cannot fit but a body line can:
    // the hero needs pad*2 + heroSize, the name only pad*2 + bodySize.
    const heroNeeds = M.pad * 2 + M.heroSize;
    const nameNeeds = M.pad * 2 + M.bodySize;
    const SHORT = nameNeeds + 8;
    expect(SHORT).toBeGreaterThanOrEqual(nameNeeds); // the name fits
    expect(SHORT).toBeLessThan(heroNeeds); // the hero does not
    const TALL = OFFSET + SHORT + 80;

    const fb = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
    renderHolidaysBox(
      fb,
      { ...makeLayout(config, OFFSET), height: SHORT },
      config,
      M,
      new Date('2026-08-20T00:00:00'),
      false,
    );

    expect(inkIn(fb.data, OFFSET, OFFSET + SHORT)).toBeGreaterThan(0); // name drawn
    expect(inkIn(fb.data, OFFSET + SHORT, TALL)).toBe(0); // still in bounds
    expect(inkIn(fb.data, 0, OFFSET)).toBe(0);
  });

  it('renders the no-data placeholder', () => {
    expect(inkIn(render({ type: 'holidays', countryCode: 'GB' }), 0, H)).toBeGreaterThan(0);
  });

  // Was previously `inkIn(data, H, H)`, which is a no-op: the loop condition
  // `r < H` is false on the first iteration, so it asserted nothing. It also
  // could not have worked — `render()` allocates a buffer exactly H tall, so
  // there are no rows past the box to inspect. Render into a taller buffer and
  // check the region below the box instead.
  it.each([
    ['no data', { type: 'holidays' as const, countryCode: 'GB' }],
    [
      'with data',
      {
        type: 'holidays' as const,
        countryCode: 'GB',
        data: { name: 'A Very Long Holiday Name That Wraps', date: '2026-12-25' },
      },
    ],
  ])('does not draw past the bottom of its box (%s)', (_label, config) => {
    // Deliberately shorter than the content needs. With a roomy box the clip
    // bounds are never reached, so the assertion below could not fail — the
    // box has to be small enough that the renderer must actually clip.
    const SHORT = 26;
    const OFFSET = 40;
    const TALL = OFFSET + SHORT + 80; // spare rows below the box
    const fb = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
    renderHolidaysBox(
      fb,
      { ...makeLayout(config, OFFSET), height: SHORT },
      config,
      M,
      new Date('2026-08-20T00:00:00'),
      false,
    );

    expect(inkIn(fb.data, 0, OFFSET)).toBe(0); // nothing above
    expect(inkIn(fb.data, OFFSET + SHORT, TALL)).toBe(0); // nothing below
  });

  // Regression guard: renderPlaceholder must use `y + drawTextWrapped(...)`,
  // not the bare height delta, to position the "No data" line. A box anchored
  // at y = 0 cannot detect this because delta === y + delta there.
  it('keeps the placeholder inside a box that is not at y = 0', () => {
    const OFFSET = 200;
    const TALL = OFFSET + H;
    const config: HolidaysBoxConfig = { type: 'holidays', countryCode: 'GB' };
    const fb = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
    renderHolidaysBox(fb, makeLayout(config, OFFSET), config, M, undefined, false);

    expect(inkIn(fb.data, 0, OFFSET)).toBe(0);
    expect(inkIn(fb.data, OFFSET, TALL)).toBeGreaterThan(0);
  });
});
