/**
 * Generate the single-PDF version of the first-time setup guide (issue #181).
 *
 * The content comes from packages/web/src/setup-guide/content.ts — the same
 * module that renders the web guide page — so the two can never drift apart.
 * The release version (root package.json) is stamped in the footer of every
 * page. Runs as part of the web build (`npm run build -w @infobento/web`),
 * writing next to the Vite output so Hono serves it at /setup-guide.pdf.
 *
 * Run standalone: npx tsx scripts/gen-setup-guide-pdf.ts [out.pdf]
 */
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { GUIDE_TITLE, GUIDE_INTRO, GUIDE_STEPS, PLACE_LABELS } = await import(
  `${REPO}/packages/web/src/setup-guide/content.ts`
);

const { version } = JSON.parse(readFileSync(`${REPO}/package.json`, 'utf8')) as {
  version: string;
};
const outPath = process.argv[2] ?? `${REPO}/packages/web/dist/setup-guide.pdf`;

// --- Layout constants (points; Letter page) ---------------------------------
const MARGIN = 54;
const FOOTER_H = 30;
const IMAGE_MAX_W = 320;
const IMAGE_MAX_H = 240;

/** Read a PNG's pixel size from its IHDR chunk (bytes 16..24). */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: MARGIN, bottom: MARGIN + FOOTER_H, left: MARGIN, right: MARGIN },
  bufferPages: true,
  info: { Title: GUIDE_TITLE, Author: 'InfoBento' },
});
mkdirSync(dirname(outPath), { recursive: true });
const stream = createWriteStream(outPath);
doc.pipe(stream);

const contentW = doc.page.width - MARGIN * 2;
const bottomY = () => doc.page.height - MARGIN - FOOTER_H;

/** Start a new page if fewer than `needed` points remain on this one. */
function ensureRoom(needed: number): void {
  if (doc.y + needed > bottomY()) doc.addPage();
}

// --- Title + intro -----------------------------------------------------------
doc.font('Helvetica-Bold').fontSize(24).text(GUIDE_TITLE);
doc.moveDown(0.5);
doc.font('Helvetica').fontSize(11).fillColor('#444').text(GUIDE_INTRO);
doc.fillColor('black');

// --- Steps -------------------------------------------------------------------
GUIDE_STEPS.forEach((step: (typeof GUIDE_STEPS)[number], i: number) => {
  ensureRoom(120);
  doc.moveDown(1.2);
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(`${String(i + 1)}.  ${step.title}`);
  doc.moveDown(0.4);

  doc.font('Helvetica').fontSize(11);
  for (const paragraph of step.body) {
    ensureRoom(40);
    doc.text(paragraph, { width: contentW });
    doc.moveDown(0.3);
  }

  for (const exp of step.expectations) {
    ensureRoom(60);
    doc.moveDown(0.3);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#666')
      .text(PLACE_LABELS[exp.place].toUpperCase());
    doc.font('Helvetica').fontSize(11).fillColor('black').text(exp.text, { width: contentW });

    if (exp.image) {
      const png = readFileSync(`${REPO}/packages/web/public${exp.image.src}`);
      const { w, h } = pngSize(png);
      const scale = Math.min(IMAGE_MAX_W / w, IMAGE_MAX_H / h, 1);
      const drawW = w * scale;
      const drawH = h * scale;
      ensureRoom(drawH + 30);
      doc.moveDown(0.5);
      // Place at explicit coordinates — pdfkit's own y-advance after a
      // fitted image is unreliable (captions drift or overlap otherwise).
      const imgY = doc.y;
      doc.image(png, MARGIN, imgY, { width: drawW, height: drawH });
      doc.y = imgY + drawH + 4;
      doc.fontSize(9).fillColor('#666').text(exp.image.caption, MARGIN, doc.y);
      doc.fillColor('black').fontSize(11);
    }
  }

  if (step.tip !== undefined) {
    ensureRoom(50);
    doc.moveDown(0.4);
    doc.font('Helvetica-Oblique').fontSize(10).text(`Tip: ${step.tip}`, { width: contentW });
    doc.font('Helvetica').fontSize(11);
  }
});

// --- Per-page footer (version on EVERY page — issue #181 requirement) --------
const range = doc.bufferedPageRange();
for (let p = range.start; p < range.start + range.count; p++) {
  doc.switchToPage(p);
  const y = doc.page.height - MARGIN - 10;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#666')
    .text(`${GUIDE_TITLE} — InfoBento v${version}`, MARGIN, y, {
      width: contentW / 2,
      lineBreak: false,
    })
    .text(`Page ${String(p + 1)} of ${String(range.count)}`, MARGIN + contentW / 2, y, {
      width: contentW / 2,
      align: 'right',
      lineBreak: false,
    });
}

doc.end();
await new Promise<void>((res, rej) => {
  stream.on('finish', () => res());
  stream.on('error', rej);
});
console.log(`wrote ${outPath} (${String(range.count)} pages, v${version})`);
