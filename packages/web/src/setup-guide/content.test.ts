import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GUIDE_INTRO, GUIDE_STEPS, GUIDE_TITLE, PLACE_LABELS } from './content';

describe('setup guide content', () => {
  it('has a title, an intro, and at least the six core steps', () => {
    expect(GUIDE_TITLE.length).toBeGreaterThan(0);
    expect(GUIDE_INTRO.length).toBeGreaterThan(0);
    expect(GUIDE_STEPS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every step a unique id, a title, and instruction text', () => {
    const ids = GUIDE_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of GUIDE_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('sets an expectation (what the user will see, and where) on every step', () => {
    for (const step of GUIDE_STEPS) {
      expect(step.expectations.length).toBeGreaterThan(0);
      for (const exp of step.expectations) {
        expect(Object.keys(PLACE_LABELS)).toContain(exp.place);
        expect(exp.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('references only images that exist in public/setup-guide with alt text', () => {
    const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
    for (const step of GUIDE_STEPS) {
      for (const exp of step.expectations) {
        if (!exp.image) continue;
        expect(exp.image.src).toMatch(/^\/setup-guide\//);
        expect(exp.image.alt.length).toBeGreaterThan(0);
        expect(exp.image.caption.length).toBeGreaterThan(0);
        expect(existsSync(publicDir + exp.image.src)).toBe(true);
      }
    }
  });

  it('sets expectations about the eInk refresh cadence and the captive portal', () => {
    const allText = GUIDE_STEPS.flatMap((s) => [
      ...s.body,
      ...s.expectations.map((e) => e.text),
      s.tip ?? '',
    ]).join(' ');
    // The two most surprising behaviors for first-time users must be covered.
    expect(allText).toMatch(/refresh/i);
    expect(allText).toMatch(/opens by itself|opens automatically/i);
    expect(allText).toMatch(/192\.168\.4\.1/);
  });
});
