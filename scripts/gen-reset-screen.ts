/**
 * Generate the resident factory-reset screens for the E1001 provisioning firmware
 * (issue #171). Renders TWO 800x480 2-bit InfoBento-native framebuffers —
 * landscape and portrait — and emits them as PROGMEM C arrays
 * (firmware/provisioning/reset_screen.h) that the firmware draws on reset,
 * before any Wi-Fi/SSID exists, so they must be baked in, not fetched.
 *
 * Portrait is rendered tall (480x800 logical) then rotated 90° into the panel's
 * fixed landscape raster (same as the /frames portrait, RFC 0002 §Q1), so the
 * firmware's uploadFrame is orientation-agnostic and the green button just picks
 * the other array. Default orientation is landscape.
 *
 * Run: npx tsx scripts/gen-reset-screen.ts
 *
 * Design (operator-directed): action-oriented "how to reconnect", an explicit
 * statement that all usage/user data was erased, large type for close-range
 * reading, and the www.infobento.com address (text + QR) for more information.
 *
 * Also renders the "wrong code" screen (issue #281) into
 * firmware/integrated/wrong_code_screen.h, with the same layout. The integrated
 * firmware draws it when the server answers a pull with 422: the device was set
 * up with the sticker's pair code instead of its Device ID.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = `${REPO}/packages/renderer/src`;

const { createFrameBuffer } = await import(`${R}/index.ts`);
const { drawText, drawTextWrapped, setPixel, rotateFrameBuffer90, GRAY_BLACK, GRAY_DARK } =
  await import(`${R}/draw.ts`);
const { renderQRBox } = await import(`${R}/boxes/qr.ts`);
const { computeFontMetrics } = await import(`${R}/font-metrics.ts`);

type FB = { width: number; height: number; data: Uint8Array };

const PANEL_W = 800;
const PANEL_H = 480;
const FRAME_LEN = (PANEL_W / 4) * PANEL_H; // 2bpp, 4 px/byte
/** Step lines that fit between the intro and the footer in both layouts. */
const MAX_STEP_LINES = 5;
const HELP_URL = 'https://www.infobento.com';
const metrics = computeFontMetrics();

/** The words on one baked screen; both orientations share the layout below. */
interface ScreenSpec {
  /** Landscape title (one line). */
  readonly title: string;
  /** Portrait title, two lines (the portrait column is too narrow for one). */
  readonly titlePortrait: readonly [string, string];
  /** Grey paragraph under the rule. */
  readonly intro: string;
  /** Numbered steps, at most MAX_STEP_LINES lines; continuation lines are indented. */
  readonly steps: readonly string[];
}

const RESET_SCREEN: ScreenSpec = {
  title: 'Set up InfoBento',
  titlePortrait: ['Set up', 'InfoBento'],
  intro: 'This device was reset. All saved Wi-Fi, settings, and usage data were erased.',
  steps: [
    '1.  On your phone, join the Wi-Fi',
    '      network  "InfoBento-XXXX"',
    '2.  The setup page opens automatically',
    '3.  Enter your home Wi-Fi and your',
    '      Device ID (not the pair code)',
  ],
};

const WRONG_CODE_SCREEN: ScreenSpec = {
  title: 'Wrong code entered',
  titlePortrait: ['Wrong code', 'entered'],
  intro: "Setup was given the sticker's pair code instead of the Device ID.",
  steps: [
    '1.  Hold both white buttons 5 s',
    '      to reset, then set up again',
    '2.  Enter the Device ID that came',
    '      with your device: 36 characters,',
    '      like  xxxxxxxx-xxxx-...',
  ],
};

function hline(fb: FB, x0: number, x1: number, y: number): void {
  for (let x = x0; x < x1; x++) setPixel(fb, x, y, GRAY_BLACK);
}

function drawQR(fb: FB, x: number, y: number, size: number): void {
  renderQRBox(
    fb,
    {
      box: {
        id: 'qr',
        type: 'qr' as const,
        label: 'HELP',
        config: { type: 'qr' as const, url: HELP_URL },
      },
      x,
      y,
      width: size,
      height: size,
    },
    { type: 'qr', url: HELP_URL },
    metrics,
    false,
  );
}

// Landscape: text column on the left, QR top-right.
function drawLandscape(spec: ScreenSpec): FB {
  const fb = createFrameBuffer({ widthPx: PANEL_W, heightPx: PANEL_H, deviceId: '' }) as FB;
  const MX = 40;
  const COL = 470;
  drawText(fb, MX, 42, spec.title, COL, GRAY_BLACK, 44, 700);
  hline(fb, MX, MX + COL, 104);
  drawTextWrapped(fb, MX, 120, spec.intro, COL, 70, GRAY_DARK, 21, 400);
  let y = 210;
  for (const line of spec.steps) {
    drawText(fb, MX, y, line, COL + 60, GRAY_BLACK, 23, 500);
    y += 40;
  }
  drawText(fb, MX, 432, 'More information:  www.infobento.com', 760, GRAY_BLACK, 22, 600);
  drawQR(fb, 545, 120, 215);
  drawText(fb, 560, 345, 'Scan for help', 200, GRAY_DARK, 18, 500);
  return fb;
}

// Portrait: rendered tall (480x800 logical), rotated into the panel raster below.
function drawPortraitLogical(spec: ScreenSpec): FB {
  const fb = createFrameBuffer({ widthPx: PANEL_H, heightPx: PANEL_W, deviceId: '' }) as FB; // 480x800
  const MX = 36;
  const COL = 480 - MX * 2;
  drawText(fb, MX, 54, spec.titlePortrait[0], COL, GRAY_BLACK, 46, 700);
  drawText(fb, MX, 104, spec.titlePortrait[1], COL, GRAY_BLACK, 46, 700);
  hline(fb, MX, MX + COL, 168);
  drawTextWrapped(fb, MX, 186, spec.intro, COL, 130, GRAY_DARK, 22, 400);
  let y = 320;
  for (const line of spec.steps) {
    drawText(fb, MX, y, line, COL + 20, GRAY_BLACK, 22, 500);
    y += 44;
  }
  drawText(fb, MX, 520, 'More information:', COL, GRAY_BLACK, 22, 600);
  drawText(fb, MX, 552, 'www.infobento.com', COL, GRAY_BLACK, 22, 600);
  drawQR(fb, MX + 60, 600, 190);
  return fb;
}

function toHeader(name: string, fb: FB): string {
  const bytes = fb.data;
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = Array.from(bytes.slice(i, i + 16)).map(
      (b) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`,
    );
    rows.push('  ' + chunk.join(',') + ',');
  }
  return `const uint8_t ${name}[] PROGMEM = {\n${rows.join('\n')}\n};\n`;
}

/** Render both orientations of one screen and check their panel geometry. */
function renderScreen(spec: ScreenSpec): { landscape: FB; portrait: FB } {
  if (spec.steps.length > MAX_STEP_LINES) {
    throw new Error(`${spec.title}: ${spec.steps.length} step lines overlap the footer`);
  }
  const landscape = drawLandscape(spec);
  const portrait = rotateFrameBuffer90(drawPortraitLogical(spec)) as FB; // 480x800 -> 800x480 panel raster
  for (const [label, fb] of [
    ['landscape', landscape],
    ['portrait', portrait],
  ] as const) {
    if (fb.width !== PANEL_W || fb.height !== PANEL_H || fb.data.length !== FRAME_LEN) {
      throw new Error(
        `${spec.title} ${label} wrong geometry: ${fb.width}x${fb.height} len=${fb.data.length}`,
      );
    }
  }
  return { landscape, portrait };
}

const FRAME_FORMAT_NOTE = `// Two ${PANEL_W}x${PANEL_H} frames, 2-bit InfoBento-native (0=white .. 3=black),
// 4 px/byte, ${FRAME_LEN} bytes each. Portrait is pre-rotated into the
// panel's landscape raster, so drawing is orientation-agnostic and the green
// button just selects the other array (default: landscape). The firmware
// NOT-flips each byte to the UC8179 canvas (0=black .. 3=white), same as the
// deep-sleep / orientation draw path.`;

const { landscape, portrait } = renderScreen(RESET_SCREEN);
const wrongCode = renderScreen(WRONG_CODE_SCREEN);

const header = `// AUTO-GENERATED by scripts/gen-reset-screen.ts — DO NOT EDIT BY HAND.
// Resident factory-reset screens for the E1001 provisioning firmware (issue #171).
${FRAME_FORMAT_NOTE}
#pragma once
#include <pgmspace.h>

static const uint16_t RESET_SCREEN_W = ${PANEL_W};
static const uint16_t RESET_SCREEN_H = ${PANEL_H};
static const uint32_t RESET_SCREEN_LEN = ${landscape.data.length};

${toHeader('RESET_SCREEN_LANDSCAPE', landscape)}
${toHeader('RESET_SCREEN_PORTRAIT', portrait)}`;

// Same frame format and geometry as the reset screen, so RESET_SCREEN_LEN applies.
const wrongCodeHeader = `// AUTO-GENERATED by scripts/gen-reset-screen.ts — DO NOT EDIT BY HAND.
// "Wrong code" screens for the E1001 integrated firmware (issue #281), drawn
// when a pull answers 422: the device was set up with the pair code.
${FRAME_FORMAT_NOTE}
#pragma once
#include <pgmspace.h>

${toHeader('WRONG_CODE_SCREEN_LANDSCAPE', wrongCode.landscape)}
${toHeader('WRONG_CODE_SCREEN_PORTRAIT', wrongCode.portrait)}`;

// Both the provisioning and integrated (Phase 7) sketches embed the same frames;
// write both so they can never drift out of sync.
const outs = [
  `${REPO}/firmware/provisioning/reset_screen.h`,
  `${REPO}/firmware/integrated/reset_screen.h`,
];
for (const out of outs) writeFileSync(out, header);
console.log(
  `wrote ${outs.length} copies — landscape+portrait, ${landscape.data.length} bytes each`,
);
// Only the integrated sketch pulls frames, so only it can receive the 422.
writeFileSync(`${REPO}/firmware/integrated/wrong_code_screen.h`, wrongCodeHeader);
console.log('wrote firmware/integrated/wrong_code_screen.h');

// The setup guide (issue #181) embeds the landscape frame so customers see
// exactly what an unconfigured device shows — regenerated here alongside the
// firmware headers so guide and firmware can never drift apart.
const { frameToPng } = await import(`${R}/png.ts`);
const guidePng = `${REPO}/packages/web/public/setup-guide/device-setup-screen.png`;
mkdirSync(dirname(guidePng), { recursive: true });
writeFileSync(guidePng, frameToPng(landscape));
console.log(`wrote ${guidePng}`);

// Optional visual check: PREVIEW=<dir> npx tsx scripts/gen-reset-screen.ts
if (process.env.PREVIEW) {
  writeFileSync(`${process.env.PREVIEW}/reset-landscape.png`, frameToPng(landscape));
  writeFileSync(`${process.env.PREVIEW}/reset-portrait.png`, frameToPng(portrait));
  writeFileSync(`${process.env.PREVIEW}/wrong-code-landscape.png`, frameToPng(wrongCode.landscape));
  writeFileSync(`${process.env.PREVIEW}/wrong-code-portrait.png`, frameToPng(wrongCode.portrait));
  console.log(`wrote preview PNGs to ${process.env.PREVIEW}`);
}
