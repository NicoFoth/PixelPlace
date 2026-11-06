interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The local copy of a canvas: palette indices plus the RGBA pixels the
 * renderer uploads. Changes are tracked as a dirty rectangle so only the
 * changed region is copied to the GPU on the next frame.
 */
export class Board {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly string[];
  readonly indices: Uint8Array;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Called whenever pixels change. */
  onChange: () => void = () => {};

  readonly #words: Uint32Array;
  readonly #packed: Uint32Array;
  #dirty: DirtyRect | null = null;

  constructor(width: number, height: number, palette: readonly string[], indices?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.palette = palette;
    this.indices = new Uint8Array(width * height);
    this.rgba = new Uint8ClampedArray(width * height * 4);
    this.#words = new Uint32Array(this.rgba.buffer);
    this.#packed = packPalette(palette);
    if (indices) this.indices.set(indices);
    for (let i = 0; i < this.indices.length; i++) this.#words[i] = this.#colorWord(this.indices[i]);
    this.#markDirty(0, 0, width, height);
  }

  contains(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    );
  }

  get(x: number, y: number): number {
    return this.indices[y * this.width + x];
  }

  /** Sets one pixel; returns whether it changed. Out-of-bounds writes are ignored. */
  set(x: number, y: number, color: number): boolean {
    if (!this.contains(x, y)) return false;
    const i = y * this.width + x;
    if (this.indices[i] === color) return false;
    this.indices[i] = color;
    this.#words[i] = this.#colorWord(color);
    this.#markDirty(x, y, x + 1, y + 1);
    this.onChange();
    return true;
  }

  colorOf(index: number): string {
    return this.palette[index] ?? '#000000';
  }

  /** Returns the region changed since the last call, or null. */
  takeDirty(): DirtyRect | null {
    const dirty = this.#dirty;
    this.#dirty = null;
    return dirty;
  }

  #colorWord(index: number): number {
    return this.#packed[index] ?? this.#packed[0] ?? 0;
  }

  #markDirty(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.#dirty;
    this.#dirty = d
      ? {
          x0: Math.min(d.x0, x0),
          y0: Math.min(d.y0, y0),
          x1: Math.max(d.x1, x1),
          y1: Math.max(d.y1, y1),
        }
      : { x0, y0, x1, y1 };
  }
}

/** Packs CSS hex colours into 32-bit RGBA words in the platform's byte order. */
function packPalette(palette: readonly string[]): Uint32Array {
  const bytes = new Uint8Array(4);
  const word = new Uint32Array(bytes.buffer);
  return Uint32Array.from(palette, (hex) => {
    const [r, g, b] = parseHexColor(hex);
    bytes[0] = r;
    bytes[1] = g;
    bytes[2] = b;
    bytes[3] = 255;
    return word[0];
  });
}

export function parseHexColor(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1];
  const value = parseInt(digits, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
