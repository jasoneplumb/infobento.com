/**
 * Intent: Calculate pixel positions for bento boxes within the display area
 * Context: Called by renderer before drawing — produces LayoutResult from BentoConfig
 * Pattern: Pure function — deterministic output for any given config + device
 * Future: Support horizontal splits, variable padding, user-defined heights
 */

import type { BentoConfig, DeviceProfile, LayoutBox, LayoutResult } from './types.js';
import { DEFAULT_DEVICE } from './constants.js';

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
  heightHints?: ReadonlyMap<number, number>,
): LayoutResult {
  const { boxes } = config;
  const paddingLevel = config.padding ?? 4;
  const pad = paddingLevel * 3; // 0=0px, 4=12px (default), 10=30px
  const gap = pad; // gap between boxes matches edge padding
  const totalWidth = device.widthPx - pad * 2;
  const totalHeight = device.heightPx - pad * 2;

  // Dynamic box constraints derived from font size:
  //   MIN_BOX_HEIGHT ensures at least one line of body text + padding renders.
  //   MAX_BOXES caps rows so they don't get too short to be useful.
  const fontSize = config.fontSize ?? 20;
  const MIN_BOX_HEIGHT = Math.max(24, Math.round(fontSize * 1.6));
  const MAX_BOXES = Math.min(10, Math.max(4, Math.floor(totalHeight / (fontSize * 3))));

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
  const dividerSpace = dividerCount * gap;
  const availableHeight = totalHeight - dividerSpace;

  // Separate QR boxes from others for height allocation
  const hasQR = boxes.some((b) => b.type === 'qr');
  const qrCount = boxes.filter((b) => b.type === 'qr').length;
  const nonQRCount = boxes.length - qrCount;

  // Compute height reserved by hints (content-aware minimum heights)
  let hintedHeight = 0;
  let hintedNonQRCount = 0;
  if (heightHints) {
    for (const [idx, minH] of heightHints) {
      const box = boxes[idx];
      if (box && box.type !== 'qr') {
        hintedHeight += minH;
        hintedNonQRCount++;
      }
    }
  }

  let qrHeight: number;
  let nonQRHeight: number;
  const unhintedNonQRCount = nonQRCount - hintedNonQRCount;

  if (hasQR && nonQRCount > 0) {
    // QR gets ~half, but cap total QR allocation to avoid overflow with multiple QR boxes
    const maxQRShare = availableHeight - nonQRCount * MIN_BOX_HEIGHT;
    const totalQRHeight = Math.min(
      Math.floor(availableHeight * QR_HEIGHT_RATIO) * qrCount,
      maxQRShare,
    );
    qrHeight = Math.floor(totalQRHeight / qrCount);
    const remainingHeight = availableHeight - qrHeight * qrCount - hintedHeight;
    nonQRHeight = unhintedNonQRCount > 0 ? Math.floor(remainingHeight / unhintedNonQRCount) : 0;
  } else if (hasQR) {
    // All boxes are QR — split evenly by row count
    qrHeight = Math.floor(availableHeight / rowCount);
    nonQRHeight = 0;
  } else {
    // No QR — distribute remaining height after hinted boxes
    qrHeight = 0;
    const remainingHeight = availableHeight - hintedHeight;
    nonQRHeight = unhintedNonQRCount > 0 ? Math.floor(remainingHeight / unhintedNonQRCount) : 0;
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
        // Use the larger allocation of the two box types, respecting height hints
        const leftH = isLeftQR ? qrHeight : (heightHints?.get(i) ?? nonQRHeight);
        const rightH = isRightQR ? qrHeight : (heightHints?.get(i + 1) ?? nonQRHeight);
        height = Math.max(leftH, rightH, MIN_BOX_HEIGHT);
      }

      const halfWidth = Math.floor((totalWidth - gap) / 2);
      const rightWidth = totalWidth - halfWidth - gap;

      layoutBoxes.push({
        box: leftBox,
        x: pad,
        y: y + pad,
        width: halfWidth,
        height,
      });

      layoutBoxes.push({
        box: rightBox,
        x: pad + halfWidth + gap,
        y: y + pad,
        width: rightWidth,
        height,
      });

      y += height + gap;
      i++; // Skip the right box since we already laid it out
      continue;
    }

    const isLast = i === boxes.length - 1;
    const isQR = box.type === 'qr';

    // Last box absorbs any remaining pixels from rounding (clamped to 0)
    let height: number;
    if (isLast) {
      height = Math.max(0, totalHeight - y);
    } else if (isQR) {
      height = qrHeight;
    } else {
      height = heightHints?.get(i) ?? nonQRHeight;
    }

    // Only clamp non-last boxes — last box absorbs rounding residue
    if (!isLast) {
      height = Math.max(height, MIN_BOX_HEIGHT);
    }

    layoutBoxes.push({
      box,
      x: pad,
      y: y + pad,
      width: totalWidth,
      height,
    });

    y += height + gap;
  }

  return { boxes: layoutBoxes, device };
}
