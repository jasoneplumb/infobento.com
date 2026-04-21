/**
 * Intent: Render a QR code bento box — border, label header, and centered QR code
 * Context: Called by the main render() dispatcher for boxes with type 'qr'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Future: Support custom error correction levels, icon overlay
 */

import qrcode from 'qrcode-generator';
import type { FrameBuffer } from '../index.js';
import type { LayoutBox, QRBoxConfig } from '@infobento/core';
import { setPixel, drawRect, drawText } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';

/** Padding inside the box border */
const INNER_PAD = 2;

/** Height reserved for the label header (font + padding) */
const HEADER_HEIGHT = FONT_HEIGHT + INNER_PAD * 2;

/** Minimum quiet zone around QR code in modules (for scannability) */
const QUIET_ZONE_MODULES = 2;

/**
 * intent: Render a complete QR code bento box into the frame buffer
 * method: Draw border, render label header, generate and center-render scaled QR
 * effect: Fills the allocated LayoutBox region with a scannable QR code
 */
export function renderQRBox(fb: FrameBuffer, layout: LayoutBox, config: QRBoxConfig): void {
  const { x, y, width, height } = layout;

  // Draw box border
  drawRect(fb, x, y, width, height);

  // Draw label in header area (uppercase for consistency with text boxes)
  const labelY = y + INNER_PAD;
  const labelX = x + INNER_PAD + 1;
  drawText(fb, labelX, labelY, layout.box.label.toUpperCase(), width - INNER_PAD * 2 - 2);

  // Draw dotted divider line below header
  const dividerY = y + HEADER_HEIGHT;
  for (let dx = x + 1; dx < x + width - 1; dx++) {
    if (dx % 2 === 0) setPixel(fb, dx, dividerY);
  }

  // Calculate body area below header
  const bodyX = x + 1; // inside border
  const bodyY = dividerY + 1;
  const bodyWidth = width - 2;
  const bodyHeight = height - HEADER_HEIGHT - 2;

  if (bodyHeight <= 0 || bodyWidth <= 0) return;

  // Generate QR code — type 0 = auto-detect version, 'M' = medium error correction
  const qr = qrcode(0, 'M');
  qr.addData(config.url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const totalModules = moduleCount + QUIET_ZONE_MODULES * 2;

  // Scale to fill available space while maintaining square pixels
  const scale = Math.max(1, Math.floor(Math.min(bodyWidth, bodyHeight) / totalModules));

  // Total rendered size of QR (including quiet zone)
  const qrSize = totalModules * scale;

  // Center QR within body area
  const qrStartX = bodyX + Math.floor((bodyWidth - qrSize) / 2);
  const qrStartY = bodyY + Math.floor((bodyHeight - qrSize) / 2);

  // The quiet zone stays white (unset pixels = white on eInk), so we only
  // need to draw the dark modules. Offset by the quiet zone margin.
  const dataOffsetX = qrStartX + QUIET_ZONE_MODULES * scale;
  const dataOffsetY = qrStartY + QUIET_ZONE_MODULES * scale;

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
