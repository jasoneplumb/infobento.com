/**
 * Intent: cover the small state-mutation invariants that aren't obvious from
 *   reading the actions in isolation. The DOM-touching paths (renderPreview
 *   etc.) are out of scope here — those are verified by manual UI testing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addBox,
  changeBoxType,
  getBoxes,
  loadConfig,
  serializeBoxes,
  setState,
  updateLabel,
  BOX_TYPE_LABELS,
  getPersistenceMode,
  getActiveDeviceId,
  enterCloudMode,
  exitToLocalMode,
  onCloudPersist,
  _resetPersistenceForTesting,
} from './state.js';

// The web tests run in a bare Node environment (no DOM). Provide a minimal
// in-memory localStorage so the local-buffer persistence paths are exercised
// for real rather than silently no-op'ing.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  _resetPersistenceForTesting();
  localStorage.clear();
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
    addBox('horoscope');
    const id = getBoxes()[0]!.id;
    changeBoxType(id, 'quote');
    const box = getBoxes()[0]!;
    expect(box.type).toBe('quote');
    expect(box.config).toEqual({ content: '', author: '' });
  });

  it('overwrites the label when it still matches the old default', () => {
    addBox('horoscope');
    const id = getBoxes()[0]!.id;
    expect(getBoxes()[0]!.label).toBe(BOX_TYPE_LABELS.horoscope);
    changeBoxType(id, 'quote');
    expect(getBoxes()[0]!.label).toBe(BOX_TYPE_LABELS.quote);
  });

  it('preserves a user-customized label across a type switch', () => {
    addBox('horoscope');
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

  it('applies a drop-in BentoConfig (no version field) via fromBentoConfig', () => {
    // This is the shape exportJSON now emits and the device's config_json stores:
    // versionless, boxes carry id + config.type, dimensions present.
    const ok = loadConfig({
      boxes: [{ id: '1', type: 'text', label: 'Hi', config: { type: 'text', text: 'drop-in' } }],
      refreshesPerDay: 1,
      width: 800,
      height: 480,
    });
    expect(ok).toBe(true);
    const boxes = getBoxes();
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.type).toBe('text');
    expect((boxes[0]!.config as { content: string }).content).toBe('drop-in');
  });

  it('rejects an object with no recognizable version', () => {
    addBox('quote');
    const before = getBoxes().length;
    expect(loadConfig({ foo: 'bar' })).toBe(false);
    expect(loadConfig(null)).toBe(false);
    expect(loadConfig({ version: 99 })).toBe(false);
    // A versionless object with a boxes array but invalid contents is rejected.
    expect(loadConfig({ boxes: [{ type: 'nope' }] })).toBe(false);
    // State is left untouched when nothing was applied.
    expect(getBoxes()).toHaveLength(before);
  });
});

describe('persistence mode (local vs cloud, issue #76)', () => {
  it('defaults to local mode with no active device', () => {
    expect(getPersistenceMode()).toBe('local');
    expect(getActiveDeviceId()).toBeNull();
  });

  it('routes saves to the cloud hook in cloud mode and leaves localStorage untouched', () => {
    // Establish a local buffer first.
    addBox('weather');
    const localBuffer = localStorage.getItem('infobento-config');
    expect(localBuffer).not.toBeNull();

    const cloudSave = vi.fn();
    onCloudPersist(cloudSave);
    enterCloudMode('device-1');
    expect(getPersistenceMode()).toBe('cloud');
    expect(getActiveDeviceId()).toBe('device-1');

    // An edit in cloud mode must hit the cloud hook, NOT localStorage.
    addBox('quote');
    expect(cloudSave).toHaveBeenCalled();
    expect(localStorage.getItem('infobento-config')).toBe(localBuffer);
  });

  it('seeds the editor from a cloud config without echoing a save back', () => {
    addBox('weather'); // local buffer
    const cloudSave = vi.fn();
    onCloudPersist(cloudSave);

    enterCloudMode('device-1', {
      version: 2,
      boxes: [
        { type: 'text', label: 'A', config: { content: 'one' } },
        { type: 'text', label: 'B', config: { content: 'two' } },
      ],
    });

    // The seed was applied to the editor...
    expect(getBoxes()).toHaveLength(2);
    expect(getBoxes()[0]!.type).toBe('text');
    // ...but applying it must not trigger a save-back.
    expect(cloudSave).not.toHaveBeenCalled();
  });

  it('sign-out restores the local edits buffer without loss', () => {
    // Local buffer: a single weather box.
    addBox('weather');
    expect(getBoxes()).toHaveLength(1);

    // Switch to a device whose config differs.
    enterCloudMode('device-1', {
      version: 2,
      boxes: [
        { type: 'quote', label: 'Q', config: { content: 'hi', author: '' } },
        { type: 'onthisday', label: 'O', config: { content: 'ha', category: 'events' } },
      ],
    });
    expect(getBoxes()).toHaveLength(2);

    // Signing out reverts to local mode and the preserved local buffer.
    exitToLocalMode();
    expect(getPersistenceMode()).toBe('local');
    expect(getActiveDeviceId()).toBeNull();
    expect(getBoxes()).toHaveLength(1);
    expect(getBoxes()[0]!.type).toBe('weather');
  });
});

describe('loadConfig — configs naming a removed box type', () => {
  beforeEach(() => {
    setState((s) => {
      s.boxes = [];
    });
  });

  it('loads the surviving boxes from a device config that still names a removed type', () => {
    // A device paired before #210 has `joke` sitting in its stored config_json.
    // Zod no longer admits that type, so without the pre-filter the whole
    // config is rejected and the owner sees none of their boxes.
    const ok = loadConfig({
      boxes: [
        { id: 'a', type: 'quote', label: 'Q', config: { type: 'quote', text: 'hi' } },
        { id: 'b', type: 'joke', label: 'J', config: { type: 'joke', text: 'ha' } },
        { id: 'c', type: 'weather', label: 'W', config: { type: 'weather', city: 'Reno' } },
      ],
      refreshesPerDay: 2,
    });

    expect(ok).toBe(true);
    expect(getBoxes().map((b) => b.type)).toEqual(['quote', 'weather']);
  });

  it('drops a removed type from a version-2 editor config', () => {
    // formBuilders has no entry for 'habit' any more, so leaving it in would
    // make buildConfigForm throw rather than degrade.
    const ok = loadConfig({
      version: 2,
      boxes: [
        { type: 'habit', label: 'H', config: { habits: [] } },
        { type: 'date', label: 'D', config: {} },
      ],
    });

    expect(ok).toBe(true);
    expect(getBoxes().map((b) => b.type)).toEqual(['date']);
  });

  it('reports failure when every box names a removed type', () => {
    // Nothing loadable is left; the caller keeps whatever it had.
    expect(
      loadConfig({
        boxes: [{ id: 'a', type: 'calendar', label: 'C', config: { type: 'calendar' } }],
        refreshesPerDay: 2,
      }),
    ).toBe(false);
  });
});
