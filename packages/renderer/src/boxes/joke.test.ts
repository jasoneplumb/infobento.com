import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from '../index.js';
import { renderJokeBox } from './joke.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { BentoConfig, LayoutBox, JokeBoxConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

describe('renderJokeBox', () => {
  function makeLayout(config: JokeBoxConfig, label = 'Joke'): LayoutBox {
    return {
      box: {
        id: 'j-1',
        type: 'joke' as const,
        label,
        config,
      },
      x: 0,
      y: 0,
      width: 200,
      height: 120,
    };
  }

  it('renders with category and joke text', () => {
    const config: JokeBoxConfig = {
      type: 'joke',
      text: 'Why do programmers prefer dark mode? Because light attracts bugs.',
      category: 'Programming',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    const layout = makeLayout(config);

    renderJokeBox(fb, layout, config, computeFontMetrics());

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without category', () => {
    const config: JokeBoxConfig = {
      type: 'joke',
      text: 'I told my computer I needed a break and it said "no problem, it will go to sleep."',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    const layout = makeLayout(config);

    renderJokeBox(fb, layout, config, computeFontMetrics());

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('handles long jokes (wrapping)', () => {
    const config: JokeBoxConfig = {
      type: 'joke',
      text: 'A SQL query walks into a bar, walks up to two tables and asks: Can I join you?',
      category: 'Pun',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    const layout = makeLayout(config);

    expect(() => renderJokeBox(fb, layout, config, computeFontMetrics())).not.toThrow();

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches correctly through render()', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'joke',
          label: 'Daily Joke',
          config: {
            type: 'joke',
            text: 'Schrödinger\u2019s cat walks into a bar and doesn\u2019t.',
            category: 'Misc',
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
