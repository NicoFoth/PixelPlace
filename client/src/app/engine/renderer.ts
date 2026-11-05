import type { Board } from './board';
import type { Camera, Point } from './camera';

/** Where the reticle is drawn, and the colour it previews (null = inspect mode). */
export interface Reticle extends Point {
  color: string | null;
}

interface Pop extends Point {
  color: string;
  start: number;
}

const BACKDROP = '#1d1f24';
const POP_DURATION_MS = 320;
/** Smallest on-screen size (CSS px) of the reticle, so it stays visible when zoomed out. */
const MIN_RETICLE_SIZE = 10;
/** Zoom (device px per canvas pixel) from which a faint pixel grid is drawn. */
const GRID_FROM_SCALE = 14;

/**
 * Draws a {@link Board} onto a visible <canvas> through a {@link Camera}.
 * Redraws only when something changed, at most once per animation frame.
 */
export class Renderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #camera: Camera;

  #board: Board | null = null;
  #source: HTMLCanvasElement | null = null;
  #sourceCtx: CanvasRenderingContext2D | null = null;
  #image: ImageData | null = null;

  #hover: Reticle | null = null;
  #selection: Reticle | null = null;
  #pops: Pop[] = [];
  #frame = 0;
  #cssWidth = 0;
  #cssHeight = 0;
  #dpr = 1;

  /** Runs after each drawn frame (used to sync UI state once per frame). */
  onFrame: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser');
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#camera = camera;
  }

  setBoard(board: Board | null): void {
    this.#board = board;
    this.#pops = [];
    this.#source = this.#sourceCtx = this.#image = null;
    if (board) {
      this.#source = document.createElement('canvas');
      this.#source.width = board.width;
      this.#source.height = board.height;
      this.#sourceCtx = this.#source.getContext('2d');
      this.#image = new ImageData(board.rgba, board.width, board.height);
      board.onChange = () => this.requestRender();
    }
    this.requestRender();
  }

  setHover(reticle: Reticle | null): void {
    this.#hover = reticle;
    this.requestRender();
  }

  setSelection(reticle: Reticle | null): void {
    this.#selection = reticle;
    this.requestRender();
  }

  /** Plays the placement animation on a pixel. */
  pop(x: number, y: number, color: string): void {
    this.#pops.push({ x, y, color, start: performance.now() });
    this.requestRender();
  }

  /** Sets the on-screen size in CSS pixels. */
  resize(width: number, height: number): void {
    this.#cssWidth = width;
    this.#cssHeight = height;
    this.#applySize();
    this.#camera.setViewport(width, height);
    this.requestRender();
  }

  requestRender(): void {
    if (!this.#frame) this.#frame = requestAnimationFrame((time) => this.#render(time));
  }

  destroy(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    if (this.#board) this.#board.onChange = () => {};
  }

  #applySize(): void {
    this.#dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.max(1, Math.round(this.#cssWidth * this.#dpr));
    this.#canvas.height = Math.max(1, Math.round(this.#cssHeight * this.#dpr));
  }

  #render(now: number): void {
    this.#frame = 0;
    // Moving the window to a screen with a different pixel density.
    if ((window.devicePixelRatio || 1) !== this.#dpr) this.#applySize();

    const ctx = this.#ctx;
    const { width, height } = this.#canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, width, height);

    const board = this.#board;
    if (board && this.#source && this.#sourceCtx && this.#image) {
      const dirty = board.takeDirty();
      if (dirty) {
        this.#sourceCtx.putImageData(
          this.#image,
          0,
          0,
          dirty.x0,
          dirty.y0,
          dirty.x1 - dirty.x0,
          dirty.y1 - dirty.y0,
        );
      }
      this.#drawBoard(board, this.#source);
      if (this.#selection) this.#drawReticle(this.#selection);
      if (this.#hover) this.#drawReticle(this.#hover);
      this.#drawPops(now);
    }

    this.onFrame();
    if (this.#pops.length) this.requestRender();
  }

  /** Device-pixel position of canvas coordinate (0, 0), snapped so pixel edges stay crisp. */
  #origin(): { ox: number; oy: number; scale: number } {
    const camera = this.#camera;
    const scale = camera.zoom * this.#dpr;
    return {
      ox: Math.round((camera.viewWidth / 2 - camera.x * camera.zoom) * this.#dpr),
      oy: Math.round((camera.viewHeight / 2 - camera.y * camera.zoom) * this.#dpr),
      scale,
    };
  }

  #drawBoard(board: Board, source: HTMLCanvasElement): void {
    const ctx = this.#ctx;
    const { ox, oy, scale } = this.#origin();
    const { width, height } = this.#canvas;

    // Outline so the canvas edge is visible against the backdrop.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = this.#dpr;
    ctx.strokeRect(
      ox - this.#dpr / 2,
      oy - this.#dpr / 2,
      board.width * scale + this.#dpr,
      board.height * scale + this.#dpr,
    );

    // Only the visible part, using whole source pixels.
    const left = clampInt(Math.floor(-ox / scale), 0, board.width);
    const top = clampInt(Math.floor(-oy / scale), 0, board.height);
    const right = clampInt(Math.ceil((width - ox) / scale), 0, board.width);
    const bottom = clampInt(Math.ceil((height - oy) / scale), 0, board.height);
    if (right <= left || bottom <= top) return;

    // Zoomed out, nearest-neighbour scaling would skip whole rows and columns,
    // so lone pixels would vanish; smoothing blends them in instead.
    ctx.imageSmoothingEnabled = scale < 1;
    if (scale < 1) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source,
      left,
      top,
      right - left,
      bottom - top,
      ox + left * scale,
      oy + top * scale,
      (right - left) * scale,
      (bottom - top) * scale,
    );

    if (scale >= GRID_FROM_SCALE) {
      ctx.beginPath();
      for (let x = left; x <= right; x++) {
        const sx = Math.round(ox + x * scale) + 0.5;
        ctx.moveTo(sx, oy + top * scale);
        ctx.lineTo(sx, oy + bottom * scale);
      }
      for (let y = top; y <= bottom; y++) {
        const sy = Math.round(oy + y * scale) + 0.5;
        ctx.moveTo(ox + left * scale, sy);
        ctx.lineTo(ox + right * scale, sy);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  #drawReticle(reticle: Reticle): void {
    const ctx = this.#ctx;
    const dpr = this.#dpr;
    const { ox, oy, scale } = this.#origin();
    const px = ox + reticle.x * scale;
    const py = oy + reticle.y * scale;

    if (reticle.color) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = reticle.color;
      ctx.fillRect(px, py, scale, scale);
      ctx.globalAlpha = 1;
    }

    const pad = Math.max(0, (MIN_RETICLE_SIZE * dpr - scale) / 2) + 1.5 * dpr;
    const x = px - pad;
    const y = py - pad;
    const size = scale + pad * 2;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeRect(x, y, size, size);
    ctx.lineWidth = dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(x, y, size, size);
  }

  #drawPops(now: number): void {
    const ctx = this.#ctx;
    const dpr = this.#dpr;
    const { ox, oy, scale } = this.#origin();
    this.#pops = this.#pops.filter((pop) => now - pop.start < POP_DURATION_MS);
    for (const pop of this.#pops) {
      const t = Math.max(0, (now - pop.start) / POP_DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const base = Math.max(scale, 4 * dpr);
      const size = base * (1 + 1.4 * (1 - eased));
      const cx = ox + (pop.x + 0.5) * scale;
      const cy = oy + (pop.y + 0.5) * scale;
      // Small on screen: fade out instead of leaving an oversized square behind.
      ctx.globalAlpha = base > scale && t > 0.6 ? (1 - t) / 0.4 : 1;
      ctx.fillStyle = pop.color;
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.6 * (1 - eased)})`;
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
