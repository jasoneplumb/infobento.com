/**
 * Browser stub for ttf-font.ts — the web preview fetches rendered frames
 * from the API server instead of rasterizing TTF fonts client-side.
 * This stub provides the metric exports so font.ts and hero-font.ts compile.
 */

export const BODY_FONT_SIZE = 20;
export const HERO_FONT_SIZE = 52;
export const BODY_LINE_HEIGHT = 26;
export const HERO_LINE_HEIGHT = 60;

export function measureText(_text: string, fontSize: number, _bold = false): number {
  // Approximate: Inter average character width ≈ 0.55 × fontSize
  return Math.round(_text.length * fontSize * 0.55);
}

export interface RasterResult {
  data: Float32Array;
  width: number;
  height: number;
  baseline: number;
}

export function rasterizeText(
  _text: string,
  fontSize: number,
  _bold = false,
  _maxWidth?: number,
): RasterResult {
  // In browser, return empty raster — preview uses API server for rendering
  return {
    data: new Float32Array(0),
    width: 0,
    height: Math.round(fontSize * 1.2),
    baseline: Math.round(fontSize),
  };
}
