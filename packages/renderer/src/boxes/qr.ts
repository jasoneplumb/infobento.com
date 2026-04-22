/**
 * Intent: Render a QR code bento box — label, thin outline, centered QR code
 * Context: Called by the main render() dispatcher for boxes with type 'qr'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Uppercase label above, thin 1px outline around QR, quiet zone inside
 */

import qrcode from 'qrcode-generator';
import type { FrameBuffer } from '../index.js';
import type { LayoutBox, QRBoxConfig } from '@infobento/core';
import { setPixel, drawRect, drawText, drawIcon } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/** Whitespace padding */
const PAD = 4;

/** Minimum quiet zone around QR code in modules (for scannability) */
const QUIET_ZONE_MODULES = 2;

/**
 * intent: Render a complete QR code bento box into the frame buffer
 * method: Uppercase label, thin 1px outline around QR, centered scaled QR with quiet zone
 * effect: Fills the allocated LayoutBox region with a scannable QR code
 */
export function renderQRBox(fb: FrameBuffer, layout: LayoutBox, config: QRBoxConfig): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  // Icon + uppercase label (5x7 font)
  const icon = BOX_ICONS['qr'];
  if (icon) drawIcon(fb, x + PAD, cy, icon);
  const labelX = x + PAD + ICON_WIDTH + 3;
  drawText(fb, labelX, cy, layout.box.label.toUpperCase(), width - PAD * 2 - ICON_WIDTH - 3);
  cy += FONT_HEIGHT + PAD;

  // Body area below label
  const bodyX = x + PAD;
  const bodyY = cy;
  const bodyWidth = width - PAD * 2;
  const bodyHeight = height - (cy - y) - PAD;

  if (bodyHeight <= 0 || bodyWidth <= 0) return;

  // Generate QR code — type 0 = auto-detect version, 'M' = medium error correction
  const qr = qrcode(0, 'M');
  qr.addData(config.url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const totalModules = moduleCount + QUIET_ZONE_MODULES * 2;

  // Scale to fill available space while maintaining square pixels
  const availableSize = Math.min(bodyWidth, bodyHeight);
  // Reserve 2px for the outline border on each side
  const innerSize = availableSize - 4;
  const scale = Math.max(1, Math.floor(innerSize / totalModules));

  // Total rendered size of QR (including quiet zone)
  const qrSize = totalModules * scale;

  // Outline size = QR size + 2px border on each side
  const outlineSize = qrSize + 4;

  // Center outline within body area
  const outlineX = bodyX + Math.floor((bodyWidth - outlineSize) / 2);
  const outlineY = bodyY + Math.floor((bodyHeight - outlineSize) / 2);

  // Draw thin 1px outline around the QR code
  drawRect(fb, outlineX, outlineY, outlineSize, outlineSize);

  // QR data starts inside the outline + quiet zone
  const dataOffsetX = outlineX + 2 + QUIET_ZONE_MODULES * scale;
  const dataOffsetY = outlineY + 2 + QUIET_ZONE_MODULES * scale;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        // Fill a scale×scale block for each dark module
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            setPixel(fb, dataOffsetX + col * scale + dx, dataOffsetY + row * scale + dy);
          }
        }
      }
    }
  }
}
