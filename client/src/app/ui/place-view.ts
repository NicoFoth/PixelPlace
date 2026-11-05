import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import type { Board } from '../engine/board';
import { Camera, PLACE_MIN_ZOOM, PLACE_ZOOM, type Point } from '../engine/camera';
import { InputController } from '../engine/input';
import { Renderer } from '../engine/renderer';
import type { Session } from '../state/session';
import { Settings } from '../state/settings';
import { formatUrlSearch } from '../state/url-state';
import { formatCountdown, formatZoom } from './format';
import { Palette } from './palette';
import { PixelInfo } from './pixel-info';

interface Toast {
  id: number;
  text: string;
}

interface StatusView {
  /** "overlay" covers the screen (no canvas yet); "banner" sits on top of a stale canvas. */
  kind: 'overlay' | 'banner';
  text: string;
  canRetry: boolean;
  canLeave: boolean;
}

const TOAST_MS = 4000;
const URL_UPDATE_DELAY_MS = 300;
const samePoint = (a: Point | null, b: Point | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y);

/** The live canvas with its HUD: server status, nickname, palette, coordinates and zoom. */
@Component({
  selector: 'pp-place-view',
  imports: [Palette, PixelInfo],
  host: { class: 'place-view' },
  templateUrl: './place-view.html',
})
export class PlaceView {
  readonly session = input.required<Session>();
  readonly leave = output<void>();

  protected readonly settings = inject(Settings);
  readonly #title = inject(Title);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly #camera = new Camera();
  #renderer: Renderer | null = null;
  #input: InputController | null = null;
  readonly #ready = signal(false);
  #viewRestored = false;
  /** Latest mouse position over the canvas, in screen coordinates. */
  #mouse: Point | null = null;
  #urlTimer: ReturnType<typeof setTimeout> | undefined;
  #toastId = 0;

  /** Pixel under the mouse, for the coordinates readout (updated once per frame). */
  protected readonly hover = signal<Point | null>(null, { equal: samePoint });
  protected readonly zoom = signal(1);
  /** Touch: the pixel aimed at, waiting for "Place". */
  protected readonly target = signal<Point | null>(null, { equal: samePoint });
  /** Whether the last interaction was touch/pen (tap aims, button confirms). */
  protected readonly touch = signal(false);
  protected readonly toasts = signal<Toast[]>([]);

  protected readonly board = computed(() => this.session().board());
  protected readonly palette = computed(() => this.board()?.palette ?? []);
  /** The selected colour, if this server's palette has it. */
  protected readonly color = computed(() => {
    const color = this.settings.color();
    return color !== null && color < this.palette().length ? color : null;
  });
  protected readonly online = computed(() => this.session().connection().status === 'open');
  protected readonly status = computed((): StatusView | null => {
    const session = this.session();
    const state = session.connection();
    const hasBoard = session.board() !== null;
    const label = session.address.label;
    switch (state.status) {
      case 'open':
      case 'closed':
        return null;
      case 'failed':
        return { kind: 'overlay', text: state.message, canRetry: false, canLeave: true };
      case 'connecting':
        return hasBoard
          ? { kind: 'banner', text: 'Reconnecting…', canRetry: false, canLeave: false }
          : { kind: 'overlay', text: `Connecting to ${label}…`, canRetry: false, canLeave: true };
      case 'waiting':
        return hasBoard
          ? {
              kind: 'banner',
              text: 'Connection lost. Reconnecting…',
              canRetry: true,
              canLeave: false,
            }
          : {
              kind: 'overlay',
              text: state.everConnected
                ? `Lost the connection to ${label}. Retrying…`
                : `Can't reach ${label}. Retrying…`,
              canRetry: true,
              canLeave: true,
            };
    }
  });
  protected readonly zoomLabel = computed(() => formatZoom(this.zoom()));
  /** Too far out to place a pixel: a click zooms in first. */
  protected readonly zoomedOut = computed(() => this.zoom() < PLACE_MIN_ZOOM);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const renderer = new Renderer(canvas, this.#camera);
      renderer.onFrame = () => {
        this.hover.set(this.#mouse ? this.#camera.pixelAt(this.#mouse.x, this.#mouse.y) : null);
        this.zoom.set(this.#camera.zoom);
      };
      this.#renderer = renderer;
      this.#input = new InputController(canvas, this.#camera, {
        onViewChange: () => this.#viewChanged(),
        onHover: (screen) => {
          this.#mouse = screen;
          this.#updateHover();
        },
        onTap: (screen, pointerType) => this.#tap(screen, pointerType),
        onEscape: () => this.#escape(),
      });

      const resize = new ResizeObserver(([entry]) => {
        renderer.resize(entry.contentRect.width, entry.contentRect.height);
        this.#updateHover();
      });
      resize.observe(canvas);
      destroyRef.onDestroy(() => resize.disconnect());
      this.#ready.set(true);
    });

    destroyRef.onDestroy(() => {
      clearTimeout(this.#urlTimer);
      this.#input?.destroy();
      this.#renderer?.destroy();
    });

    // A new board arrives on every (re)connect.
    effect(() => {
      if (!this.#ready()) return;
      const board = this.board();
      untracked(() => this.#showBoard(board));
    });

    // Session callbacks.
    effect(() => {
      const session = this.session();
      session.onNotice = (text) => this.notify(text);
      session.onPlaced = (x, y, color) =>
        this.#renderer?.pop(x, y, session.board()?.colorOf(color) ?? '#000');
    });

    // Reticle colour follows the selected colour; selection outline follows target/inspected pixel.
    effect(() => {
      if (!this.#ready()) return;
      const color = this.color();
      const target = this.target();
      const inspected = this.session().inspected();
      untracked(() => {
        this.#updateHover();
        const css = color === null ? null : this.palette()[color];
        if (target) this.#renderer?.setSelection({ ...target, color: css });
        else if (inspected) this.#renderer?.setSelection({ ...inspected, color: null });
        else this.#renderer?.setSelection(null);
      });
    });

    effect(() => this.#title.setTitle(`${this.session().address.label} · PixelPlace`));
  }

  // --- template actions -------------------------------------------------------

  protected selectColor(color: number | null): void {
    this.settings.color.set(color);
    if (color === null) this.target.set(null);
    else this.session().inspect(null);
  }

  protected confirmPlacement(): void {
    const target = this.target();
    const color = this.color();
    if (target && color !== null) this.#place(target, color);
  }

  protected setNickname(event: Event): void {
    this.settings.nickname.set((event.target as HTMLInputElement).value);
  }

  protected zoomBy(factor: number): void {
    this.#camera.zoomBy(factor);
    this.#viewChanged();
  }

  protected fit(): void {
    this.#camera.fit();
    this.#viewChanged();
  }

  protected closeInfo(): void {
    this.session().inspect(null);
  }

  protected notify(text: string): void {
    const id = ++this.#toastId;
    this.toasts.update((list) => [...list.filter((t) => t.text !== text), { id, text }].slice(-3));
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }

  // --- internals ----------------------------------------------------------------

  #showBoard(board: Board | null): void {
    const renderer = this.#renderer;
    if (!renderer) return;
    renderer.setBoard(board);
    this.target.set(null);
    if (!board) return;
    this.#camera.setCanvasSize(board.width, board.height);
    if (!this.#viewRestored) {
      this.#viewRestored = true;
      const view = this.session().initialView;
      if (view) {
        this.#camera.centerOn(
          view.x + 0.5,
          view.y + 0.5,
          view.zoom ?? Math.max(PLACE_MIN_ZOOM, this.#camera.fitZoom),
        );
      } else {
        this.#camera.fit();
      }
      this.#viewChanged();
    }
  }

  #viewChanged(): void {
    this.#updateHover();
    this.#renderer?.requestRender();
    clearTimeout(this.#urlTimer);
    this.#urlTimer = setTimeout(() => this.#writeUrl(), URL_UPDATE_DELAY_MS);
  }

  #updateHover(): void {
    const renderer = this.#renderer;
    if (!renderer) return;
    const pixel = this.#mouse ? this.#camera.pixelAt(this.#mouse.x, this.#mouse.y) : null;
    const color = this.color();
    renderer.setHover(
      pixel ? { ...pixel, color: color === null ? null : this.palette()[color] } : null,
    );
  }

  #tap(screen: Point, pointerType: string): void {
    const touch = pointerType !== 'mouse';
    this.touch.set(touch);
    const pixel = this.#camera.pixelAt(screen.x, screen.y);
    const color = this.color();
    if (!pixel) {
      this.target.set(null);
      this.session().inspect(null);
    } else if (color === null) {
      this.target.set(null);
      this.session().inspect(pixel);
    } else if (this.#camera.zoom < PLACE_MIN_ZOOM) {
      // Too small to aim at: zoom in on the spot, keeping it under the pointer.
      this.target.set(null);
      this.#camera.zoomAt(screen.x, screen.y, PLACE_ZOOM);
      this.#viewChanged();
    } else if (touch) {
      this.target.set(pixel);
    } else {
      this.#place(pixel, color);
    }
  }

  #place(pixel: Point, color: number): void {
    const session = this.session();
    const outcome = session.place(pixel.x, pixel.y, color, this.settings.nickname());
    if (outcome === 'sent') {
      this.target.set(null);
    } else if (outcome === 'cooldown') {
      this.notify(
        `You can place another pixel in ${formatCountdown(session.cooldownRemaining())}.`,
      );
    } else {
      this.notify('Not connected right now, so your pixel was not placed.');
    }
  }

  #escape(): void {
    if (this.target()) this.target.set(null);
    else if (this.color() !== null) this.settings.color.set(null);
    else this.session().inspect(null);
  }

  #writeUrl(): void {
    const camera = this.#camera;
    const search = formatUrlSearch(
      {
        server: this.session().address.param,
        view: { x: camera.x, y: camera.y, zoom: camera.zoom },
      },
      location.search,
    );
    history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
  }
}
