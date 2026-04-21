/**
 * Generate preview images with fabricated plausible data for different box configurations.
 * Outputs individual PNGs and a contact sheet.
 */

import { render, frameToPng } from '@infobento/renderer';
import type { BentoConfig } from '@infobento/core';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SCALE = 4;

// --- Config A: Morning Commuter (5 boxes, dense) ---
const configA: BentoConfig = {
  boxes: [
    {
      id: '1',
      label: 'Weather',
      type: 'text',
      config: { type: 'text', text: 'Portland 62F Partly Cloudy  H:68 L:55' },
    },
    {
      id: '2',
      label: 'Next',
      type: 'text',
      config: { type: 'text', text: '9:00 AM  Standup w/ team' },
    },
    {
      id: '3',
      label: 'Countdown',
      type: 'text',
      config: { type: 'text', text: '14 days to Maui' },
    },
    {
      id: '4',
      label: 'Inbox',
      type: 'text',
      config: { type: 'text', text: '3 emails  7 slack  1 teams' },
    },
    {
      id: '5',
      label: 'Quote',
      type: 'text',
      config: {
        type: 'text',
        text: 'The best time to plant a tree was 20 years ago. The second best time is now.',
      },
    },
  ],
  refreshesPerDay: 2,
};

// --- Config B: Desk Display (3 boxes, spacious) ---
const configB: BentoConfig = {
  boxes: [
    {
      id: '1',
      label: 'Today',
      type: 'text',
      config: { type: 'text', text: 'Monday April 21, 2026' },
    },
    {
      id: '2',
      label: 'Focus',
      type: 'text',
      config: { type: 'text', text: 'Ship the renderer. Everything else can wait.' },
    },
    {
      id: '3',
      label: 'Streak',
      type: 'text',
      config: { type: 'text', text: '12 days without skipping a workout' },
    },
  ],
  refreshesPerDay: 1,
};

// --- Config C: Networking Card (2 boxes + QR placeholder, asymmetric) ---
const configC: BentoConfig = {
  boxes: [
    {
      id: '1',
      label: 'Jason Plumber',
      type: 'text',
      config: { type: 'text', text: 'Engineering @ InfoBento' },
    },
    { id: '2', label: 'QR', type: 'qr' },
    {
      id: '3',
      label: 'Links',
      type: 'text',
      config: { type: 'text', text: 'github.com/jasoneplumb  linkedin.com/in/jasoneplumb' },
    },
  ],
  refreshesPerDay: 1,
};

// --- Config D: Kitchen Counter (4 boxes, practical) ---
const configD: BentoConfig = {
  boxes: [
    {
      id: '1',
      label: 'Weather',
      type: 'text',
      config: { type: 'text', text: '58F Rainy  Precip 80%  Wind 12mph NW' },
    },
    {
      id: '2',
      label: 'Agenda',
      type: 'text',
      config: {
        type: 'text',
        text: '8:30 School drop-off  10:00 Dentist  3:15 Pickup  6:00 Dinner @ Pok Pok',
      },
    },
    {
      id: '3',
      label: 'Groceries',
      type: 'text',
      config: { type: 'text', text: 'Eggs  Milk  Sourdough  Cilantro  Limes' },
    },
    {
      id: '4',
      label: 'Doors',
      type: 'text',
      config: { type: 'text', text: 'Front: Locked  Garage: Locked  Back: UNLOCKED' },
    },
  ],
  refreshesPerDay: 2,
};

// --- Config E: Minimal (2 boxes, zen) ---
const configE: BentoConfig = {
  boxes: [
    {
      id: '1',
      label: 'Thought',
      type: 'text',
      config: {
        type: 'text',
        text: 'Simplicity is the ultimate sophistication. -- Leonardo da Vinci',
      },
    },
    { id: '2', label: 'Days Alive', type: 'text', config: { type: 'text', text: '13,297' } },
  ],
  refreshesPerDay: 1,
};

// --- Config F: Busy Parent (6 boxes, max density) ---
const configF: BentoConfig = {
  boxes: [
    {
      id: '1',
      label: 'Weather',
      type: 'text',
      config: { type: 'text', text: '72F Sunny  UV: High' },
    },
    {
      id: '2',
      label: 'Next Event',
      type: 'text',
      config: { type: 'text', text: '2:30 PM Soccer practice' },
    },
    {
      id: '3',
      label: 'Todo',
      type: 'text',
      config: { type: 'text', text: 'Return library books' },
    },
    {
      id: '4',
      label: 'Messages',
      type: 'text',
      config: { type: 'text', text: '2 texts  5 email  0 slack' },
    },
    {
      id: '5',
      label: 'Countdown',
      type: 'text',
      config: { type: 'text', text: '8 days to Spring Break' },
    },
    {
      id: '6',
      label: 'Reminder',
      type: 'text',
      config: { type: 'text', text: 'Piano recital Thursday 7pm' },
    },
  ],
  refreshesPerDay: 2,
};

const configs = [
  { name: 'A-commuter', config: configA },
  { name: 'B-desk', config: configB },
  { name: 'C-networking', config: configC },
  { name: 'D-kitchen', config: configD },
  { name: 'E-minimal', config: configE },
  { name: 'F-maxdensity', config: configF },
];

// Render individual PNGs
const pngs: { name: string; data: Uint8Array }[] = [];
for (const { name, config } of configs) {
  const fb = render(config);
  const png = frameToPng(fb, SCALE);
  const path = `previews/${name}.png`;
  writeFileSync(path, png);
  pngs.push({ name, data: png });
  console.log(`  ${path} (${png.length} bytes)`);
}

// Build contact sheet: 3 columns x 2 rows
const COLS = 3;
const ROWS = 2;
const cellW = 240 * SCALE;
const cellH = 200 * SCALE;
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
for (let i = 0; i < configs.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const offsetX = gap + col * (cellW + gap);
  const offsetY = gap + row * (cellH + labelH + gap);

  // Parse the individual PNG
  const entry = pngs[i];
  if (!entry) continue;
  const img = PNG.sync.read(Buffer.from(entry.data));

  // Copy pixels
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
