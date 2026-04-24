import { describe, it, expect } from 'vitest';
import { renderTasksBox } from './tasks.js';
import { createFrameBuffer, render, computeFontMetrics } from '../index.js';
import type { LayoutBox, TasksBoxConfig, BentoConfig } from '@infobento/core';

const metrics = computeFontMetrics();

/** Count number of set bits in a byte */
function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: TasksBoxConfig): LayoutBox {
  return {
    box: { id: 'tasks-1', type: 'tasks' as const, label: 'Tasks', config },
    x: 0,
    y: 0,
    width: 460,
    height: 300,
  };
}

describe('renderTasksBox', () => {
  it('renders with mix of done and pending items', () => {
    const config: TasksBoxConfig = {
      type: 'tasks',
      items: [
        { text: 'Buy groceries', done: true },
        { text: 'Write report', done: false },
        { text: 'Call dentist', done: false },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderTasksBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders all done items', () => {
    const config: TasksBoxConfig = {
      type: 'tasks',
      items: [
        { text: 'Task A', done: true },
        { text: 'Task B', done: true },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderTasksBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders all pending items', () => {
    const config: TasksBoxConfig = {
      type: 'tasks',
      items: [
        { text: 'Pending one', done: false },
        { text: 'Pending two', done: false },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    renderTasksBox(fb, layout, config, metrics);

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches correctly through render()', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'tasks',
          label: 'To Do',
          config: {
            type: 'tasks',
            items: [
              { text: 'Ship feature', done: false },
              { text: 'Fix bug', done: true },
            ],
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('does not crash with empty items list', () => {
    const config: TasksBoxConfig = {
      type: 'tasks',
      items: [],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    const layout = makeLayout(config);

    expect(() => renderTasksBox(fb, layout, config, metrics)).not.toThrow();
  });

  it('does not crash with tiny layout dimensions', () => {
    const config: TasksBoxConfig = {
      type: 'tasks',
      items: [{ text: 'Test', done: false }],
    };
    const fb = createFrameBuffer({ widthPx: 20, heightPx: 20, deviceId: '' });
    const layout: LayoutBox = {
      box: { id: 'tasks-1', type: 'tasks' as const, label: 'Tasks', config },
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    };

    expect(() => renderTasksBox(fb, layout, config, metrics)).not.toThrow();
  });
});
