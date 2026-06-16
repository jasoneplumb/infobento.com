/**
 * Generate per-device QR stickers for manufacturing (epic #80, issue #78).
 *
 * Reads a CSV of `(device_id, pair_code)` rows and emits one print-ready SVG
 * sticker per device. Each sticker carries a QR code encoding the pairing deep
 * link `<base-url>/pair/<pair_code>` plus the human-readable pair code as a
 * camera-free fallback, sized to print at 25mm x 25mm.
 *
 * The pair code — not the device id — is what the QR encodes: the device id is
 * the firmware's bearer secret and must never appear on the outside of the box.
 *
 * Run:
 *   npm run gen-stickers -- scripts/sample-devices.csv stickers/
 *   npm run gen-stickers -- devices.csv out/ --sheet --page letter
 *   npm run gen-stickers -- devices.csv out/ --base-url https://staging.infobento.com
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import qrcode from 'qrcode-generator';

/** Pair-code alphabet — mirrors generatePairCode() in packages/api/src/mint.ts. */
const PAIR_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAIR_CODE_LENGTH = 6;

/** Quiet zone around the QR, in modules. 4 is the QR spec minimum for reliable scans. */
const QUIET_ZONE_MODULES = 4;

/** Print page sizes in millimetres (portrait). */
const PAGES = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const;
type PageName = keyof typeof PAGES;

/** Physical sticker edge in millimetres. */
const STICKER_MM = 25;
/** Gap between stickers on a combined sheet, in millimetres. */
const SHEET_GAP_MM = 4;
/** Sheet outer margin, in millimetres. */
const SHEET_MARGIN_MM = 10;

interface DeviceRow {
  deviceId: string;
  pairCode: string;
}

interface CliArgs {
  inputPath: string;
  outDir: string;
  baseUrl: string;
  sheet: boolean;
  page: PageName;
  help: boolean;
}

const HELP = `Generate per-device QR stickers from a CSV.

Usage: npm run gen-stickers -- <input.csv> <output-dir> [options]

Arguments:
  <input.csv>    CSV with columns device_id,pair_code (header row optional).
  <output-dir>   Directory to write <device_id>.svg files into (created if absent).

Options:
  --base-url <url>   Pairing URL origin (default: https://infobento.com).
  --sheet            Also emit a combined, tiled sheet.svg for batch printing.
  --page <a4|letter> Sheet page size (default: a4). Only used with --sheet.
  -h, --help         Show this help.

Each sticker encodes <base-url>/pair/<pair_code> as a QR plus the human-readable
pair code, designed to print at ${STICKER_MM}mm x ${STICKER_MM}mm.
`;

function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  const args: Partial<CliArgs> = {
    baseUrl: 'https://infobento.com',
    sheet: false,
    page: 'a4',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--base-url': {
        const value = argv[++i];
        if (value === undefined) throw new Error(`Missing value for ${arg}`);
        // Validate as an http(s) URL: the value is interpolated into the QR
        // payload, so an unchecked `javascript:`/`data:` value would encode a
        // scannable hostile URL onto a physical sticker.
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          throw new Error(`--base-url must be a valid URL, got: "${value}"`);
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(`--base-url must be http(s), got: "${parsed.protocol}"`);
        }
        args.baseUrl = value.replace(/\/+$/, '');
        break;
      }
      case '--page': {
        const value = argv[++i];
        if (value === undefined) throw new Error(`Missing value for ${arg}`);
        if (value !== 'a4' && value !== 'letter') {
          throw new Error(`--page must be 'a4' or 'letter', got: "${value}"`);
        }
        args.page = value;
        break;
      }
      case '--sheet':
        args.sheet = true;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }
  if (args.help) return args as CliArgs;
  if (positional.length !== 2) {
    throw new Error(`Expected <input.csv> and <output-dir>; got ${positional.length} argument(s).`);
  }
  args.inputPath = positional[0];
  args.outDir = positional[1];
  return args as CliArgs;
}

/**
 * Parse a `(device_id, pair_code)` CSV. Tolerates an optional header row,
 * surrounding whitespace, blank lines, and `#` comment lines. Validates each
 * pair code against the minting alphabet so a typo in the CSV can't silently
 * produce an unscannable or wrong-coded sticker.
 */
function parseCsv(text: string): DeviceRow[] {
  const rows: DeviceRow[] = [];
  const seenCodes = new Set<string>();
  const seenIds = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('#')) continue;

    const cells = line.split(',').map((c) => c.trim());
    // Index access (not destructuring) so noUncheckedIndexedAccess forces the
    // undefined check that proves both columns are present.
    const deviceId = cells[0];
    const rawCode = cells[1];
    if (deviceId === undefined || rawCode === undefined) {
      throw new Error(`Line ${i + 1}: expected 2 columns (device_id,pair_code), got: "${line}"`);
    }

    // Skip a header row if present.
    if (deviceId.toLowerCase() === 'device_id' || rawCode.toLowerCase() === 'pair_code') continue;

    const pairCode = rawCode.toUpperCase();
    if (
      pairCode.length !== PAIR_CODE_LENGTH ||
      ![...pairCode].every((ch) => PAIR_CODE_ALPHABET.includes(ch))
    ) {
      throw new Error(
        `Line ${i + 1}: invalid pair code "${rawCode}" — must be ${PAIR_CODE_LENGTH} chars from ${PAIR_CODE_ALPHABET}.`,
      );
    }
    // deviceId becomes an output filename — constrain it so a crafted row can't
    // escape outDir (e.g. "../../etc/cron.d/evil") or resolve to a dot-entry.
    if (!/^[A-Za-z0-9._-]+$/.test(deviceId) || deviceId === '.' || deviceId === '..') {
      throw new Error(
        `Line ${i + 1}: invalid device id "${deviceId}" — only letters, digits, '.', '-', '_' allowed.`,
      );
    }
    if (seenCodes.has(pairCode))
      throw new Error(`Line ${i + 1}: duplicate pair code "${pairCode}".`);
    if (seenIds.has(deviceId)) throw new Error(`Line ${i + 1}: duplicate device id "${deviceId}".`);
    seenCodes.add(pairCode);
    seenIds.add(deviceId);

    rows.push({ deviceId, pairCode });
  }
  if (rows.length === 0) throw new Error('No device rows found in CSV.');
  return rows;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/**
 * Build an SVG `<path>` `d` string covering every dark QR module, expressed in a
 * 0..QR_VIEW coordinate space (the QR fills the whole space including quiet zone).
 * One path for the whole symbol keeps the SVG small and renders crisply at any size.
 */
const QR_VIEW = 100;
function qrPath(url: string): string {
  const qr = qrcode(0, 'M'); // type 0 = auto version, 'M' = medium error correction
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const total = count + QUIET_ZONE_MODULES * 2;
  const module = QR_VIEW / total;
  const offset = QUIET_ZONE_MODULES * module;

  let d = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      const x = offset + col * module;
      const y = offset + row * module;
      // Slightly overdraw (+0.02) to avoid hairline seams between modules at scale.
      d += `M${x.toFixed(3)} ${y.toFixed(3)}h${(module + 0.02).toFixed(3)}v${(module + 0.02).toFixed(3)}h${(-module - 0.02).toFixed(3)}z`;
    }
  }
  return d;
}

/**
 * Render one sticker as a standalone SVG. The viewBox is 100x100 user units
 * mapped to STICKER_MM, so 1 unit = 0.25mm. `embedPhysicalSize` toggles the
 * width/height attributes (set for standalone files, omitted when nested in a sheet).
 */
function stickerSvg(row: DeviceRow, baseUrl: string, embedPhysicalSize: boolean): string {
  const url = `${baseUrl}/pair/${row.pairCode}`;
  const path = qrPath(url);

  // Layout in the 0..100 viewBox.
  const qrSize = 62; // QR edge
  const qrX = (100 - qrSize) / 2;
  const qrY = 6;

  const sizeAttrs = embedPhysicalSize ? ` width="${STICKER_MM}mm" height="${STICKER_MM}mm"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttrs} viewBox="0 0 100 100" role="img" aria-label="Pair code ${row.pairCode}">
  <rect x="0" y="0" width="100" height="100" fill="#ffffff"/>
  <g transform="translate(${qrX} ${qrY}) scale(${qrSize / QR_VIEW})">
    <path d="${path}" fill="#000000" shape-rendering="crispEdges"/>
  </g>
  <text x="50" y="82" text-anchor="middle" font-family="'DejaVu Sans Mono','Courier New',monospace" font-size="13" font-weight="700" letter-spacing="1.5" fill="#000000">${escapeXml(row.pairCode)}</text>
  <text x="50" y="94" text-anchor="middle" font-family="'DejaVu Sans','Helvetica',sans-serif" font-size="6" letter-spacing="0.5" fill="#666666">InfoBento</text>
</svg>`;
}

/** Grid capacity (columns, rows, stickers) for one page of the given size. */
function pageGrid(page: PageName): { cols: number; rows: number; perPage: number } {
  const { w: pageW, h: pageH } = PAGES[page];
  const pitch = STICKER_MM + SHEET_GAP_MM;
  const cols = Math.max(1, Math.floor((pageW - SHEET_MARGIN_MM * 2 + SHEET_GAP_MM) / pitch));
  const rows = Math.max(1, Math.floor((pageH - SHEET_MARGIN_MM * 2 + SHEET_GAP_MM) / pitch));
  return { cols, rows, perPage: cols * rows };
}

/**
 * Tile up to one page of stickers onto a page-sized SVG. Callers paginate so
 * every sheet stays exactly page-sized — printing keeps stickers at their true
 * 25mm rather than scaling a taller-than-page canvas down to fit.
 */
function sheetSvg(rows: DeviceRow[], baseUrl: string, page: PageName, cols: number): string {
  const { w: pageW, h: pageH } = PAGES[page];
  const pitch = STICKER_MM + SHEET_GAP_MM;

  let body = '';
  rows.forEach((row, i) => {
    const col = i % cols;
    const r = Math.floor(i / cols);
    const x = SHEET_MARGIN_MM + col * pitch;
    const y = SHEET_MARGIN_MM + r * pitch;
    const inner = stickerSvg(row, baseUrl, false)
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
    body += `  <g transform="translate(${x} ${y}) scale(${STICKER_MM / 100})">
    <rect x="0" y="0" width="100" height="100" fill="none" stroke="#cccccc" stroke-width="0.3" stroke-dasharray="2 2"/>${inner}
  </g>\n`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#ffffff"/>
${body}</svg>`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const rows = parseCsv(readFileSync(args.inputPath, 'utf8'));
  mkdirSync(args.outDir, { recursive: true });

  for (const row of rows) {
    const file = join(args.outDir, `${row.deviceId}.svg`);
    writeFileSync(file, stickerSvg(row, args.baseUrl, true) + '\n');
  }

  let extra = '';
  if (args.sheet) {
    const { cols, perPage } = pageGrid(args.page);
    const pageCount = Math.ceil(rows.length / perPage);
    // One page → sheet.svg; multiple → sheet-1.svg, sheet-2.svg, … so each file
    // stays page-sized and prints stickers at their true 25mm.
    for (let p = 0; p < pageCount; p++) {
      const slice = rows.slice(p * perPage, (p + 1) * perPage);
      const name = pageCount === 1 ? 'sheet.svg' : `sheet-${p + 1}.svg`;
      writeFileSync(join(args.outDir, name), sheetSvg(slice, args.baseUrl, args.page, cols) + '\n');
    }
    const label =
      pageCount === 1 ? 'sheet.svg' : `sheet-1.svg … sheet-${pageCount}.svg (${pageCount} pages)`;
    extra = `\n  + ${label} (${args.page.toUpperCase()} batch — open in a browser and Print to PDF)`;
  }

  process.stdout.write(
    `Wrote ${rows.length} sticker${rows.length === 1 ? '' : 's'} to ${args.outDir}/` +
      ` (QR -> ${args.baseUrl}/pair/<code>)${extra}\n`,
  );
}

main();
