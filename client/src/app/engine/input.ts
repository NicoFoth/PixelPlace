import type { Camera } from './camera';

export interface InputCallbacks {
  /** The camera moved or zoomed. */
  onViewChange(): void;
  /** A mouse moved over the canvas (screen coordinates), or left it (null). */
  onHover(screen: { x: number; y: number } | null): void;
  /** A click or tap that wasn't a drag. */
  onTap(screen: { x: number; y: number }, pointerType: string): void;
  onEscape(): void;
}

interface TrackedPointer {
  x: number;
  y: number;
}

/** Movement (CSS px) after which a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = { mouse: 4, touch: 10 };
const KEY_PAN_STEP = 100;
const KEY_ZOOM_STEP = 1.5;

/**
 * Turns pointer, wheel and keyboard input into camera movement and taps.
 * Mouse: drag with left or middle button to pan, wheel to zoom at the cursor.
 * Touch: one finger pans, two fingers pinch-zoom.
 */
export class InputController {
  readonly #element: HTMLElement;
  readonly #camera: Camera;
  readonly #callbacks: InputCallbacks;
  readonly #pointers = new Map<number, TrackedPointer>();
  readonly #abort = new AbortController();

  /** State of the current press: where it started and whether it became a drag/pinch. */
  #press: { x: number; y: number; pointerType: string; dragged: boolean } | null = null;
  #pinch: { distance: number; midX: number; midY: number } | null = null;

  constructor(element: HTMLElement, camera: Camera, callbacks: InputCallbacks) {
    this.#element = element;
    this.#camera = camera;
    this.#callbacks = callbacks;
    const options = { signal: this.#abort.signal };
    element.addEventListener('pointerdown', (e) => this.#down(e), options);
    element.addEventListener('pointermove', (e) => this.#move(e), options);
    element.addEventListener('pointerup', (e) => this.#up(e, true), options);
    element.addEventListener('pointercancel', (e) => this.#up(e, false), options);
    element.addEventListener(
      'pointerleave',
      (e) => e.pointerType === 'mouse' && callbacks.onHover(null),
      options,
    );
    element.addEventListener('wheel', (e) => this.#wheel(e), { ...options, passive: false });
    window.addEventListener('keydown', (e) => this.#key(e), options);
  }

  destroy(): void {
    this.#abort.abort();
  }

  #local(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.#element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #down(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    if (event.button === 1) event.preventDefault(); // no autoscroll
    this.#element.setPointerCapture(event.pointerId);
    const point = this.#local(event);
    this.#pointers.set(event.pointerId, point);

    if (this.#pointers.size === 1) {
      this.#press = { ...point, pointerType: event.pointerType, dragged: false };
    } else {
      // A second finger: this gesture is a pinch, never a tap.
      if (this.#press) this.#press.dragged = true;
      this.#pinch = this.#pinchState();
    }
  }

  #move(event: PointerEvent): void {
    const point = this.#local(event);
    const tracked = this.#pointers.get(event.pointerId);
    if (event.pointerType === 'mouse') this.#callbacks.onHover(point);
    if (!tracked) return;

    if (this.#pointers.size === 1 && this.#press) {
      const threshold = event.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.touch;
      if (
        !this.#press.dragged &&
        Math.hypot(point.x - this.#press.x, point.y - this.#press.y) > threshold
      ) {
        this.#press.dragged = true;
      }
      if (this.#press.dragged) {
        this.#camera.panBy(point.x - tracked.x, point.y - tracked.y);
        this.#callbacks.onViewChange();
      }
      tracked.x = point.x;
      tracked.y = point.y;
      return;
    }

    tracked.x = point.x;
    tracked.y = point.y;
    const pinch = this.#pinchState();
    if (this.#pinch && pinch) {
      this.#camera.panBy(pinch.midX - this.#pinch.midX, pinch.midY - this.#pinch.midY);
      if (this.#pinch.distance > 0) {
        this.#camera.zoomAt(
          pinch.midX,
          pinch.midY,
          this.#camera.zoom * (pinch.distance / this.#pinch.distance),
        );
      }
      this.#callbacks.onViewChange();
    }
    this.#pinch = pinch;
  }

  #up(event: PointerEvent, completed: boolean): void {
    if (!this.#pointers.delete(event.pointerId)) return;
    if (this.#pointers.size === 0) {
      const press = this.#press;
      this.#press = null;
      this.#pinch = null;
      if (completed && press && !press.dragged)
        this.#callbacks.onTap(this.#local(event), press.pointerType);
    } else {
      // Pinch ended with fingers remaining: continue from where they are now.
      this.#pinch = this.#pinchState();
    }
  }

  #pinchState(): { distance: number; midX: number; midY: number } | null {
    const [a, b] = [...this.#pointers.values()];
    if (!a || !b) return null;
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  #wheel(event: WheelEvent): void {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.#camera.viewHeight : 1;
    // Trackpad pinches arrive as ctrl+wheel with small deltas.
    const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
    const factor = Math.exp(-event.deltaY * unit * sensitivity);
    const point = this.#local(event);
    this.#camera.zoomAt(point.x, point.y, this.#camera.zoom * factor);
    this.#callbacks.onViewChange();
    this.#callbacks.onHover(point);
  }

  #key(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    const camera = this.#camera;
    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
        camera.panBy(KEY_PAN_STEP, 0);
        break;
      case 'ArrowRight':
      case 'd':
        camera.panBy(-KEY_PAN_STEP, 0);
        break;
      case 'ArrowUp':
      case 'w':
        camera.panBy(0, KEY_PAN_STEP);
        break;
      case 'ArrowDown':
      case 's':
        camera.panBy(0, -KEY_PAN_STEP);
        break;
      case '+':
      case '=':
        camera.zoomBy(KEY_ZOOM_STEP);
        break;
      case '-':
      case '_':
        camera.zoomBy(1 / KEY_ZOOM_STEP);
        break;
      case 'Escape':
        this.#callbacks.onEscape();
        return;
      default:
        return;
    }
    event.preventDefault();
    this.#callbacks.onViewChange();
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}
