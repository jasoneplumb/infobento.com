/**
 * Intent: cover the small state-mutation invariants that aren't obvious from
 *   reading the actions in isolation. The DOM-touching paths (renderPreview
 *   etc.) are out of scope here — those are verified by manual UI testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addBox,
  changeBoxType,
  getBoxes,
  setState,
  updateLabel,
  BOX_TYPE_LABELS,
} from './state.js';

beforeEach(() => {
  setState((s) => {
    s.boxes = [];
  });
});

describe('changeBoxType', () => {
  it('replaces type and resets config to the new defaults', () => {
    addBox('joke');
    const id = getBoxes()[0]!.id;
    changeBoxType(id, 'quote');
    const box = getBoxes()[0]!;
    expect(box.type).toBe('quote');
    expect(box.config).toEqual({ content: '', author: '' });
  });

  it('overwrites the label when it still matches the old default', () => {
    addBox('joke');
    const id = getBoxes()[0]!.id;
    expect(getBoxes()[0]!.label).toBe(BOX_TYPE_LABELS.joke);
    changeBoxType(id, 'quote');
    expect(getBoxes()[0]!.label).toBe(BOX_TYPE_LABELS.quote);
  });

  it('preserves a user-customized label across a type switch', () => {
    addBox('joke');
    const id = getBoxes()[0]!.id;
    updateLabel(id, 'My favorite');
    changeBoxType(id, 'quote');
    expect(getBoxes()[0]!.label).toBe('My favorite');
  });

  it('preserves split, weight, and splitRatio (layout invariants)', () => {
    addBox('weather');
    addBox('quote');
    const left = getBoxes()[0]!;
    const right = getBoxes()[1]!;
    setState((s) => {
      // Hand-set up a split pair with non-default weights.
      s.boxes[0] = { ...left, split: 'left', weight: 3, splitRatio: 1 };
      s.boxes[1] = { ...right, split: 'right' };
    });
    const leftId = getBoxes()[0]!.id;
    changeBoxType(leftId, 'date');
    const after = getBoxes()[0]!;
    expect(after.type).toBe('date');
    expect(after.split).toBe('left');
    expect(after.weight).toBe(3);
    expect(after.splitRatio).toBe(1);
    // Right partner is untouched.
    expect(getBoxes()[1]!.split).toBe('right');
  });

  it('is a no-op when the new type matches the current type', () => {
    addBox('quote');
    const id = getBoxes()[0]!.id;
    setState((s) => {
      const box = s.boxes[0];
      if (box) {
        (box.config as { content: string; author: string }).content = 'edited';
      }
    });
    changeBoxType(id, 'quote');
    const cfg = getBoxes()[0]!.config as { content: string };
    expect(cfg.content).toBe('edited');
  });
});
