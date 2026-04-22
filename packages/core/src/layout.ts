/**
 * Intent: Calculate pixel positions for bento boxes within the display area
 * Context: Called by renderer before drawing — produces LayoutResult from BentoConfig
 * Pattern: Pure function — deterministic output for any given config + device
 * Future: Support horizontal splits, variable padding, user-defined heights
 */

import type { BentoConfig, DeviceProfile, LayoutBox, LayoutResult } from './types.js';
import { BOX_DIVIDER_PX, DEFAULT_DEVICE } from './constants.js';

/**
 * intent: Minimum height for a non-QR bento box (ensures body text renders)
 * constraint: HEADER_HEIGHT (11) + divider (1) + INNER_PAD (2) + FONT_HEIGHT (7) + border (2) + 1 = 24
 */
const MIN_BOX_HEIGHT = 24;

/** Maximum number of boxes that fit without overflow */
const MAX_BOXES = 6;

/**
 * intent: QR boxes get approximately half the display height for scannability
 * constraint: REQ-007 — QR code must be large enough to scan at credit-card size
 */
const QR_HEIGHT_RATIO = 0.5;

/**
 * intent: Arrange bento boxes vertically within the display area
 * method: Stack boxes top-to-bottom, full width. QR gets ~half height, rest split evenly.
 * effect: Returns positioned boxes that exactly fill the display with no gaps or overlap
 */
export function calculateLayout(
  config: BentoConfig,
  device: DeviceProfile = DEFAULT_DEVICE,
): LayoutResult {
  const { boxes } = config;
  const totalWidth = device.widthPx;
  const totalHeight = device.heightPx;

  if (boxes.length === 0) {
    return { boxes: [], device };
  }

  if (boxes.length > MAX_BOXES) {
    // Truncate to MAX_BOXES rather than producing broken layout
    return calculateLayout({ ...config, boxes: boxes.slice(0, MAX_BOXES) }, device);
  }

  // Count visual rows: a split left+right pair occupies one row
  let rowCount = 0;
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const nextBox = i + 1 < boxes.length ? boxes[i + 1] : undefined;
    if (box?.split === 'left' && nextBox?.split === 'right') {
      rowCount++;
      i++; // skip the right partner
    } else {
      rowCount++;
    }
  }

  const dividerCount = Math.max(0, rowCount - 1);
  const dividerSpace = dividerCount * BOX_DIVIDER_PX;
  const availableHeight = totalHeight - dividerSpace;

  // Separate QR boxes from others for height allocation
  const hasQR = boxes.some((b) => b.type === 'qr');
  const qrCount = boxes.filter((b) => b.type === 'qr').length;
  const nonQRCount = boxes.length - qrCount;

  let qrHeight: number;
  let nonQRHeight: number;

  if (hasQR && nonQRCount > 0) {
    // QR gets ~half, but cap total QR allocation to avoid overflow with multiple QR boxes
    const maxQRShare = availableHeight - nonQRCount * MIN_BOX_HEIGHT;
    const totalQRHeight = Math.min(
      Math.floor(availableHeight * QR_HEIGHT_RATIO) * qrCount,
      maxQRShare,
    );
    qrHeight = Math.floor(totalQRHeight / qrCount);
    const remainingHeight = availableHeight - qrHeight * qrCount;
    nonQRHeight = Math.floor(remainingHeight / nonQRCount);
  } else if (hasQR) {
    // All boxes are QR — split evenly by row count
    qrHeight = Math.floor(availableHeight / rowCount);
    nonQRHeight = 0;
  } else {
    // No QR — split evenly by row count
    qrHeight = 0;
    nonQRHeight = Math.floor(availableHeight / rowCount);
  }

  // Build layout boxes — handles horizontal split pairs
  const layoutBoxes: LayoutBox[] = [];
  let y = 0;

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box) continue;

    const nextBox = i + 1 < boxes.length ? boxes[i + 1] : undefined;
    const isSplitPair = box.split === 'left' && nextBox !== undefined && nextBox.split === 'right';

    if (isSplitPair) {
      // Lay out two boxes side-by-side sharing the same row
      const leftBox = box;
      const rightBox = nextBox;
      const isLastPair = i + 2 >= boxes.length;
      const isLeftQR = leftBox.type === 'qr';
      const isRightQR = rightBox.type === 'qr';

      let height: number;
      if (isLastPair) {
        height = Math.max(0, totalHeight - y);
      } else {
        // Use the larger allocation of the two box types
        const leftH = isLeftQR ? qrHeight : nonQRHeight;
        const rightH = isRightQR ? qrHeight : nonQRHeight;
        height = Math.max(leftH, rightH, MIN_BOX_HEIGHT);
      }

      const halfWidth = Math.floor(totalWidth / 2);
      const rightWidth = totalWidth - halfWidth;

      layoutBoxes.push({
        box: leftBox,
        x: 0,
        y,
        width: halfWidth,
        height,
      });

      layoutBoxes.push({
        box: rightBox,
        x: halfWidth,
        y,
        width: rightWidth,
        height,
      });

      y += height + BOX_DIVIDER_PX;
      i++; // Skip the right box since we already laid it out
      continue;
    }

    const isLast = i === boxes.length - 1;
    const isQR = box.type === 'qr';

    // Last box absorbs any remaining pixels from rounding (clamped to 0)
    let height: number;
    if (isLast) {
      height = Math.max(0, totalHeight - y);
    } else {
      height = isQR ? qrHeight : nonQRHeight;
    }

    // Only clamp non-last boxes — last box absorbs rounding residue
    if (!isLast) {
      height = Math.max(height, MIN_BOX_HEIGHT);
    }

    layoutBoxes.push({
      box,
      x: 0,
      y,
      width: totalWidth,
      height,
    });

    y += height + BOX_DIVIDER_PX;
  }

  return { boxes: layoutBoxes, device };
}
