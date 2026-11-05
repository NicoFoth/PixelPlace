import { gzipSync } from 'node:zlib';
import { encodeSnapshotFrame } from '../../shared/protocol.ts';

/** The live canvas: one palette index per pixel, row-major. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  #version = 0;
  #snapshot: { version: number; frame: Uint8Array } | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }

  get(x: number, y: number): number {
    return this.pixels[y * this.width + x];
  }

  set(x: number, y: number, color: number): void {
    this.pixels[y * this.width + x] = color;
    this.#version++;
  }

  /** Call after writing to `pixels` directly (e.g. when loading from disk). */
  invalidate(): void {
    this.#version++;
  }

  /**
   * The current canvas as a binary snapshot frame. Compression happens at
   * most once per canvas change, so many clients connecting at the same time
   * (e.g. reconnecting after a restart) share one compressed copy.
   */
  snapshotFrame(): Uint8Array {
    if (this.#snapshot === null || this.#snapshot.version !== this.#version) {
      const frame = encodeSnapshotFrame(this.width, this.height, gzipSync(this.pixels));
      this.#snapshot = { version: this.#version, frame };
    }
    return this.#snapshot.frame;
  }
}
