/**
 * Generate preview images using the real renderer pipeline.
 * Six configs: commuter, desk, networking, kitchen, minimal, busy-parent.
 * Outputs individual PNGs + a 3x2 contact sheet.
 */

import type { BentoConfig } from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@infobento/core';
import { render, frameToPng } from '@infobento/renderer';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SCALE = 3;

// --- Config definitions ---

const configA: BentoConfig = {
  displayId: 'D',
  refreshesPerDay: 2,
  boxes: [
    {
      id: 'weather',
      label: 'Weather',
      type: 'weather',
      config: {
        type: 'weather',
        city: 'Portland',
        data: { temperature: 62, condition: 'Partly Cloudy', high: 68, low: 55 },
      },
    },
    {
      id: 'countdown',
      label: 'Countdown',
      type: 'countdown',
      config: { type: 'countdown', targetDate: '2026-05-05', label: 'Maui' },
    },
    {
      id: 'next',
      label: 'Next',
      type: 'text',
      config: { type: 'text', text: 'Standup w/ team 9:00 AM' },
    },
    {
      id: 'inbox',
      label: 'Inbox',
      type: 'text',
      config: { type: 'text', text: '3 email  7 slack  1 teams' },
    },
  ],
};

const configB: BentoConfig = {
  displayId: 'P',
  refreshesPerDay: 1,
  boxes: [
    {
      id: 'today',
      label: 'Today',
      type: 'text',
      config: { type: 'text', text: 'Monday April 21, 2026' },
    },
    {
      id: 'quote',
      label: 'Quote',
      type: 'quote',
      config: {
        type: 'quote',
        text: 'Ship the renderer. Everything else can wait.',
      },
    },
    {
      id: 'streak',
      label: 'Streak',
      type: 'countdown',
      config: { type: 'countdown', targetDate: '2026-05-03', label: 'Streak' },
    },
  ],
};

const configC: BentoConfig = {
  displayId: 'D',
  refreshesPerDay: 1,
  boxes: [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      config: {
        type: 'text',
        text: 'Bento McBoxface - Pixel Wrangler @ InfoBento',
      },
    },
    {
      id: 'qr',
      label: 'QR',
      type: 'qr',
      config: { type: 'qr', url: 'https://github.com/bentomcboxface' },
    },
    {
      id: 'links',
      label: 'Links',
      type: 'text',
      config: {
        type: 'text',
        text: 'github.com/bentomcboxface  linkedin.com/in/definitely-real',
      },
    },
  ],
};

const configD: BentoConfig = {
  displayId: 'P',
  refreshesPerDay: 2,
  boxes: [
    {
      id: 'weather',
      label: 'Weather',
      type: 'weather',
      config: {
        type: 'weather',
        city: 'Portland',
        data: { temperature: 58, condition: 'Rainy', high: 62, low: 51 },
      },
    },
    {
      id: 'agenda',
      label: 'Agenda',
      type: 'text',
      config: {
        type: 'text',
        text: '8:30 School dropoff  10:00 Dentist  3:15 Pickup  6:00 Pok Pok dinner',
      },
    },
    {
      id: 'groceries',
      label: 'Groceries',
      type: 'text',
      config: { type: 'text', text: 'Eggs Milk Sourdough Cilantro Limes' },
    },
    {
      id: 'doors',
      label: 'Doors',
      type: 'text',
      config: {
        type: 'text',
        text: 'Front: Locked  Garage: Locked  Back: UNLOCKED',
      },
    },
  ],
};

const configE: BentoConfig = {
  displayId: 'P',
  refreshesPerDay: 1,
  boxes: [
    {
      id: 'quote',
      label: 'Quote',
      type: 'quote',
      config: {
        type: 'quote',
        text: 'Simplicity is the ultimate sophistication.',
        author: 'da Vinci',
      },
    },
    {
      id: 'days',
      label: 'Days Alive',
      type: 'text',
      config: { type: 'text', text: 'Days alive: 13,297' },
    },
  ],
};

const configF: BentoConfig = {
  displayId: 'D',
  refreshesPerDay: 2,
  boxes: [
    {
      id: 'weather',
      label: 'Weather',
      type: 'weather',
      config: {
        type: 'weather',
        city: 'Portland',
        data: { temperature: 72, condition: 'Sunny', high: 78, low: 65 },
      },
    },
    {
      id: 'countdown',
      label: 'Countdown',
      type: 'countdown',
      config: { type: 'countdown', targetDate: '2026-04-29', label: 'Spring Break' },
    },
    {
      id: 'next',
      label: 'Next',
      type: 'text',
      config: { type: 'text', text: '2:30 PM Soccer practice' },
    },
    {
      id: 'messages',
      label: 'Messages',
      type: 'text',
      config: { type: 'text', text: '2 texts  5 email  0 slack' },
    },
  ],
};

// --- Render all configs ---

const configs = [
  { name: 'A-commuter', config: configA },
  { name: 'B-desk', config: configB },
  { name: 'C-networking', config: configC },
  { name: 'D-kitchen', config: configD },
  { name: 'E-minimal', config: configE },
  { name: 'F-busyparent', config: configF },
];

const pngs: { name: string; data: Uint8Array }[] = [];

for (const { name, config } of configs) {
  const fb = render(config);
  const png = frameToPng(fb, SCALE);
  const path = `previews/${name}.png`;
  writeFileSync(path, png);
  pngs.push({ name, data: png });
  console.log(`  ${path} (${png.length} bytes)`);
}

// --- Build contact sheet: 3 columns x 2 rows ---

const W = DISPLAY_WIDTH;
const H = DISPLAY_HEIGHT;
const COLS = 3;
const ROWS = 2;
const cellW = W * SCALE;
const cellH = H * SCALE;
const gap = 16;
const labelH = 32;
const sheetW = COLS * cellW + (COLS - 1) * gap + gap * 2;
const sheetH = ROWS * (cellH + labelH) + (ROWS - 1) * gap + gap * 2;

const sheet = new PNG({ width: sheetW, height: sheetH, colorType: 2 });

// Fill with light gray background
for (let y = 0; y < sheetH; y++) {
  for (let x = 0; x < sheetW; x++) {
    const idx = (y * sheetW + x) * 4;
    sheet.data[idx] = 0xee;
    sheet.data[idx + 1] = 0xee;
    sheet.data[idx + 2] = 0xee;
    sheet.data[idx + 3] = 0xff;
  }
}

// Place each preview into the contact sheet
for (let i = 0; i < pngs.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const offsetX = gap + col * (cellW + gap);
  const offsetY = gap + row * (cellH + labelH + gap);

  const entry = pngs[i];
  if (!entry) continue;
  const img = PNG.sync.read(Buffer.from(entry.data));

  for (let y = 0; y < img.height && y < cellH; y++) {
    for (let x = 0; x < img.width && x < cellW; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const dstIdx = ((offsetY + labelH + y) * sheetW + (offsetX + x)) * 4;
      sheet.data[dstIdx] = img.data[srcIdx] ?? 0;
      sheet.data[dstIdx + 1] = img.data[srcIdx + 1] ?? 0;
      sheet.data[dstIdx + 2] = img.data[srcIdx + 2] ?? 0;
      sheet.data[dstIdx + 3] = 0xff;
    }
  }
}

const sheetPng = PNG.sync.write(sheet);
writeFileSync('previews/contact-sheet.png', sheetPng);
console.log(`  previews/contact-sheet.png (${sheetPng.length} bytes)`);
console.log('Done.');
