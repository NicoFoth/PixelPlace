export interface Point {
  x: number;
  y: number;
}

/** Most screen pixels a single canvas pixel can cover. */
export const MAX_ZOOM = 64;

/**
 * Smallest zoom at which a click places a pixel. Further out, a single pixel
 * is too small to aim at or even see, so a click zooms in to PLACE_ZOOM instead.
 */
export const PLACE_MIN_ZOOM = 4;

/** Zoom used when a click zooms in so a pixel can be placed. */
export const PLACE_ZOOM = 16;

/** Fraction of the viewport the canvas fills after {@link Camera.fit}. */
const FIT_MARGIN = 0.9;

/**
 * Maps between screen coordinates (CSS pixels, relative to the viewport's
 * top-left corner) and canvas coordinates (canvas pixels).
 */
export class Camera {
  /** Canvas coordinate shown at the centre of the viewport. */
  x = 0;
  y = 0;
  /** Screen pixels per canvas pixel. */
  zoom = 1;

  viewWidth = 0;
  viewHeight = 0;
  canvasWidth = 0;
  canvasHeight = 0;

  setViewport(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.clamp();
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.clamp();
  }

  /** Zoom at which the whole canvas fits in the viewport. */
  get fitZoom(): number {
    if (!this.viewWidth || !this.viewHeight || !this.canvasWidth || !this.canvasHeight) return 1;
    return (
      Math.min(this.viewWidth / this.canvasWidth, this.viewHeight / this.canvasHeight) * FIT_MARGIN
    );
  }

  get minZoom(): number {
    return Math.min(1, this.fitZoom / 2);
  }

  get maxZoom(): number {
    return Math.max(MAX_ZOOM, this.fitZoom);
  }

  screenToCanvas(sx: number, sy: number): Point {
    return {
      x: this.x + (sx - this.viewWidth / 2) / this.zoom,
      y: this.y + (sy - this.viewHeight / 2) / this.zoom,
    };
  }

  canvasToScreen(cx: number, cy: number): Point {
    return {
      x: (cx - this.x) * this.zoom + this.viewWidth / 2,
      y: (cy - this.y) * this.zoom + this.viewHeight / 2,
    };
  }

  /** The canvas pixel under a screen point, or null outside the canvas. */
  pixelAt(sx: number, sy: number): Point | null {
    const point = this.screenToCanvas(sx, sy);
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= this.canvasWidth || y >= this.canvasHeight) return null;
    return { x, y };
  }

  /** Sets the zoom while keeping the canvas point under (sx, sy) in place. */
  zoomAt(sx: number, sy: number, zoom: number): void {
    const anchor = this.screenToCanvas(sx, sy);
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.x = anchor.x - (sx - this.viewWidth / 2) / this.zoom;
    this.y = anchor.y - (sy - this.viewHeight / 2) / this.zoom;
    this.clamp();
  }

  /** Multiplies the zoom, anchored at the viewport centre by default. */
  zoomBy(factor: number, sx = this.viewWidth / 2, sy = this.viewHeight / 2): void {
    this.zoomAt(sx, sy, this.zoom * factor);
  }

  /** Moves the view by a screen-space distance (drag direction). */
  panBy(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  centerOn(cx: number, cy: number, zoom = this.zoom): void {
    this.x = cx;
    this.y = cy;
    this.zoom = zoom;
    this.clamp();
  }

  fit(): void {
    this.centerOn(this.canvasWidth / 2, this.canvasHeight / 2, this.fitZoom);
  }

  /** Keeps the zoom in range and the viewport centre over the canvas. */
  clamp(): void {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.x = clamp(this.x, 0, this.canvasWidth);
    this.y = clamp(this.y, 0, this.canvasHeight);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
