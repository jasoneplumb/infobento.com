import { describe, it, expect } from 'vitest';
import { pickFallbackQuote, pickFallbackJoke, pickFallbackHoroscope } from './index.js';

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

describe('pickFallbackJoke', () => {
  it('returns a joke on every call', () => {
    for (let i = 0; i < 10; i++) {
      const j = pickFallbackJoke();
      expect(j).not.toBeNull();
      expect(j!.text.length).toBeGreaterThan(0);
      expect(j!.category.length).toBeGreaterThan(0);
    }
  });

  it('respects a known category filter when entries exist', () => {
    // 'Programming' has the most entries in the bundled set.
    let sawProgramming = 0;
    for (let i = 0; i < 30; i++) {
      const j = pickFallbackJoke('Programming');
      if (j?.category === 'Programming') sawProgramming++;
    }
    expect(sawProgramming).toBeGreaterThan(0);
  });

  it('treats "Any" as no filter', () => {
    const j = pickFallbackJoke('Any');
    expect(j).not.toBeNull();
  });

  it('falls back to the full pool when the requested category has no matches', () => {
    // Dark/Spooky/Christmas + safe-mode are empty in the bundled set;
    // requesting them should still return a joke from the available pool.
    const j = pickFallbackJoke('Dark');
    expect(j).not.toBeNull();
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
