import { describe, it, expect } from 'vitest';
import { SOURCE_ICONS, BOX_ICONS, SRC_ICON_SIZE, ICON_WIDTH, ICON_HEIGHT } from './icons.js';

describe('SOURCE_ICONS', () => {
  // drawBoxHeader silently skips the icon when the entry is undefined, so a
  // missing box type is a visual-only regression that no render test catches.
  it('has an entry for the holidays box type', () => {
    expect(SOURCE_ICONS['holidays']).toBeDefined();
  });

  it.each(Object.keys(SOURCE_ICONS))('%s is a square bitmap with in-range rows', (name) => {
    const icon = SOURCE_ICONS[name];
    expect(icon).toHaveLength(SRC_ICON_SIZE);
    for (const row of icon ?? []) {
      expect(Number.isInteger(row)).toBe(true);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(1 << SRC_ICON_SIZE);
    }
  });

  it('expands every source icon to native resolution', () => {
    expect(Object.keys(BOX_ICONS).sort()).toEqual(Object.keys(SOURCE_ICONS).sort());
    for (const icon of Object.values(BOX_ICONS)) {
      expect(icon).toHaveLength(ICON_HEIGHT);
      for (const row of icon) expect(row).toBeLessThan(2 ** ICON_WIDTH);
    }
  });

  it('renders the holidays icon as non-blank ink', () => {
    const rows = SOURCE_ICONS['holidays'] ?? [];
    expect(rows.some((r) => r !== 0)).toBe(true);
  });
});
