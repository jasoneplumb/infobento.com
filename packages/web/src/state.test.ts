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
  loadConfig,
  serializeBoxes,
  setState,
  updateLabel,
  BOX_TYPE_LABELS,
} from './state.js';

beforeEach(() => {
  setState((s) => {
    s.boxes = [];
  });
});

describe('serializeBoxes (export/persist round-trip)', () => {
  it('preserves merged-row markers (split side + divider ratio)', () => {
    addBox('weather');
    addBox('quote');
    setState((s) => {
      s.boxes[0] = { ...s.boxes[0]!, split: 'left', splitRatio: 35 };
      s.boxes[1] = { ...s.boxes[1]!, split: 'right' };
    });
    const out = serializeBoxes(getBoxes());
    expect(out[0]).toMatchObject({ split: 'left', splitRatio: 35 });
    expect(out[1]).toMatchObject({ split: 'right' });
  });

  it('omits the default divider ratio (50) but keeps the split', () => {
    addBox('weather');
    setState((s) => {
      s.boxes[0] = { ...s.boxes[0]!, split: 'left', splitRatio: 50 };
    });
    const out = serializeBoxes(getBoxes());
    expect(out[0]).toHaveProperty('split', 'left');
    expect(out[0]).not.toHaveProperty('splitRatio');
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

  it('preserves split and splitRatio (layout invariants)', () => {
    addBox('weather');
    addBox('quote');
    const left = getBoxes()[0]!;
    const right = getBoxes()[1]!;
    setState((s) => {
      // Hand-set up a split pair with a non-default ratio.
      s.boxes[0] = { ...left, split: 'left', splitRatio: 33 };
      s.boxes[1] = { ...right, split: 'right' };
    });
    const leftId = getBoxes()[0]!.id;
    changeBoxType(leftId, 'date');
    const after = getBoxes()[0]!;
    expect(after.type).toBe('date');
    expect(after.split).toBe('left');
    expect(after.splitRatio).toBe(33);
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

describe('loadConfig (device pairing / import shared loader)', () => {
  it('applies a version-2 config into state', () => {
    const ok = loadConfig({
      version: 2,
      boxes: [{ type: 'text', label: 'Hi', config: { content: 'yo' } }],
    });
    expect(ok).toBe(true);
    const boxes = getBoxes();
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.type).toBe('text');
    expect((boxes[0]!.config as { content: string }).content).toBe('yo');
  });

  it('rejects an object with no recognizable version', () => {
    addBox('quote');
    const before = getBoxes().length;
    expect(loadConfig({ foo: 'bar' })).toBe(false);
    expect(loadConfig(null)).toBe(false);
    expect(loadConfig({ version: 99 })).toBe(false);
    // State is left untouched when nothing was applied.
    expect(getBoxes()).toHaveLength(before);
  });
});
