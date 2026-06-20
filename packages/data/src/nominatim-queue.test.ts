import { describe, it, expect } from 'vitest';
import { RateLimitedQueue } from './nominatim-queue.js';

describe('RateLimitedQueue', () => {
  it('runs tasks in submission order', async () => {
    const q = new RateLimitedQueue(0);
    const order: number[] = [];
    const ps = [1, 2, 3].map((n) =>
      q.run(async () => {
        order.push(n);
        return n;
      }),
    );
    const results = await Promise.all(ps);
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('enforces the minimum interval between consecutive task starts', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const q = new RateLimitedQueue(
      1000,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );

    await Promise.all([q.run(async () => 'a'), q.run(async () => 'b'), q.run(async () => 'c')]);

    // First task starts immediately; each subsequent one waits a full interval.
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('does not sleep when the interval is zero', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const q = new RateLimitedQueue(
      0,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );
    await Promise.all([q.run(async () => 1), q.run(async () => 2)]);
    expect(sleeps).toEqual([]);
  });

  it('a rejecting task does not wedge the queue', async () => {
    const q = new RateLimitedQueue(0);
    await expect(
      q.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(q.run(async () => 42)).resolves.toBe(42);
  });
});
