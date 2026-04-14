/** 1-bit frame buffer: each byte holds 8 horizontal pixels */
export interface FrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}
