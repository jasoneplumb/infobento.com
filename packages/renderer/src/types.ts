/** 2-bit frame buffer: each byte holds 4 horizontal pixels (2 bits each, MSB-first) */
export interface FrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}
