import { describe, it, expect } from 'vitest';
import { pickFallbackQuote, pickFallbackHoroscope } from './index.js';

describe('pickFallbackQuote', () => {
  it('returns a quote on every call', () => {
    for (let i = 0; i < 10; i++) {
      const q = pickFallbackQuote();
      expect(q).not.toBeNull();
      expect(q!.text.length).toBeGreaterThan(0);
    }
  });

  it('respects a known tag filter when entries exist', () => {
    // 'wisdom' is well-represented in the bundled set; sample 30 picks and
    // expect at least one to come back tagged wisdom (random, but very likely).
    let sawWisdom = 0;
    for (let i = 0; i < 30; i++) {
      const q = pickFallbackQuote('wisdom');
      if (q) sawWisdom++;
    }
    expect(sawWisdom).toBeGreaterThan(0);
  });

  it('falls back to the full pool when the requested tag has no matches', () => {
    const q = pickFallbackQuote('xyzzy-no-such-tag');
    expect(q).not.toBeNull();
    expect(q!.text.length).toBeGreaterThan(0);
  });
});

describe('pickFallbackHoroscope', () => {
  it('stamps the requested sign on the returned reading', () => {
    for (const sign of ['aries', 'leo', 'pisces']) {
      const h = pickFallbackHoroscope(sign);
      expect(h).not.toBeNull();
      expect(h!.sign).toBe(sign);
      expect(h!.text.length).toBeGreaterThan(0);
    }
  });
});
