import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumeToken,
  _resetForTesting,
  RATE_LIMIT_RATE,
  RATE_LIMIT_WINDOW_MS,
} from './rate-limit.js';

describe('rate-limit token bucket', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('allows up to RATE consecutive requests then denies', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_RATE; i++) {
      expect(consumeToken('dev1', t0)).toBe(true);
    }
    expect(consumeToken('dev1', t0)).toBe(false);
  });

  it('refills one token per (window / rate) ms', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_RATE; i++) consumeToken('dev1', t0);
    expect(consumeToken('dev1', t0)).toBe(false);

    const refillMs = RATE_LIMIT_WINDOW_MS / RATE_LIMIT_RATE;
    expect(consumeToken('dev1', t0 + refillMs)).toBe(true);
    expect(consumeToken('dev1', t0 + refillMs)).toBe(false);
  });

  it('caps refill at RATE even after a long idle period', () => {
    const t0 = 1_000_000;
    consumeToken('dev1', t0); // burn 1, leaves 9
    // Idle for ten windows
    const later = t0 + RATE_LIMIT_WINDOW_MS * 10;
    for (let i = 0; i < RATE_LIMIT_RATE; i++) {
      expect(consumeToken('dev1', later)).toBe(true);
    }
    expect(consumeToken('dev1', later)).toBe(false);
  });

  it('keeps separate buckets per key', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_RATE; i++) consumeToken('dev1', t0);
    expect(consumeToken('dev1', t0)).toBe(false);
    // dev2 is unaffected
    expect(consumeToken('dev2', t0)).toBe(true);
  });
});
