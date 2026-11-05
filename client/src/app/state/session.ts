import { signal } from '@angular/core';
import {
  decodePixelsFrame,
  type ClientMessage,
  type HelloMessage,
  type PixelInfoMessage,
  type PlaceRequest,
} from '@shared/protocol';
import { Board } from '../engine/board';
import type { Point } from '../engine/camera';
import {
  Connection,
  type ConnectionHandler,
  type ConnectionState,
  type ControlMessage,
} from '../net/connection';
import type { ServerAddress } from '../net/server-address';
import type { UrlView } from './url-state';

export type PlaceOutcome = 'sent' | 'cooldown' | 'offline';

export interface ConnectionLike {
  start(): void;
  send(message: ClientMessage): boolean;
  retryNow(): void;
  close(): void;
}

export interface SessionOptions {
  /** Camera position to restore once the canvas arrives (from a shared link). */
  initialView?: UrlView | null;
  createConnection?: (url: string, handler: ConnectionHandler) => ConnectionLike;
  now?: () => number;
}

const PLACE_ERRORS: Record<string, string> = {
  invalid: 'The server rejected that pixel.',
  server_error: "The server couldn't save that pixel. Please try again.",
};

/** Everything the client knows about one server it is connected to. */
export class Session {
  readonly address: ServerAddress;
  readonly initialView: UrlView | null;

  readonly connection = signal<ConnectionState>({ status: 'connecting', attempt: 0 });
  /** Replaced on every (re)connect; individual pixel changes don't touch the signal. */
  readonly board = signal<Board | null>(null);
  readonly cooldownMs = signal(0);
  /** Date.now() time at which the next pixel may be placed. */
  readonly cooldownEndsAt = signal(0);
  readonly online = signal(0);
  /** The pixel whose details are shown, and its details once they arrive. */
  readonly inspected = signal<Point | null>(null);
  readonly pixelInfo = signal<PixelInfoMessage | null>(null);

  /** Called with short messages for the user (rejected placements, server errors). */
  onNotice: (text: string) => void = () => {};
  /** Called after the local player places a pixel (for the pop animation). */
  onPlaced: (x: number, y: number, color: number) => void = () => {};

  readonly #connection: ConnectionLike;
  readonly #now: () => number;
  #palette: readonly string[] = [];
  #infoRefresh: ReturnType<typeof setTimeout> | null = null;

  constructor(address: ServerAddress, options: SessionOptions = {}) {
    this.address = address;
    this.initialView = options.initialView ?? null;
    this.#now = options.now ?? Date.now;
    const handler: ConnectionHandler = {
      state: (state) => this.connection.set(state),
      hello: (message) => this.#hello(message),
      snapshot: (width, height, pixels) => this.#snapshot(width, height, pixels),
      pixels: (frame) => this.#pixels(frame),
      message: (message) => this.#message(message),
    };
    this.#connection = options.createConnection
      ? options.createConnection(address.wsUrl, handler)
      : new Connection(address.wsUrl, handler);
    this.#connection.start();
  }

  cooldownRemaining(): number {
    return Math.max(0, this.cooldownEndsAt() - this.#now());
  }

  /** Places a pixel optimistically; the server's answer confirms or reverts it. */
  place(x: number, y: number, color: number, nickname: string): PlaceOutcome {
    const board = this.board();
    if (!board || !board.contains(x, y) || this.connection().status !== 'open') return 'offline';
    if (this.cooldownRemaining() > 0) return 'cooldown';
    const request: PlaceRequest = { type: 'place', x, y, color };
    const name = nickname.trim();
    if (name) request.nickname = name;
    if (!this.#connection.send(request)) return 'offline';

    board.set(x, y, color);
    this.cooldownEndsAt.set(this.#now() + this.cooldownMs());
    this.onPlaced(x, y, color);
    return 'sent';
  }

  /** Shows who placed a pixel; null closes the details. */
  inspect(pixel: Point | null): void {
    this.inspected.set(pixel);
    this.pixelInfo.set(null);
    if (pixel) this.#connection.send({ type: 'info', x: pixel.x, y: pixel.y });
  }

  retryNow(): void {
    this.#connection.retryNow();
  }

  dispose(): void {
    if (this.#infoRefresh !== null) clearTimeout(this.#infoRefresh);
    this.#connection.close();
  }

  #hello(message: HelloMessage): void {
    this.#palette = message.palette;
    this.cooldownMs.set(message.cooldownMs);
    this.cooldownEndsAt.set(this.#now() + message.cooldownRemainingMs);
    this.online.set(message.online);
  }

  #snapshot(width: number, height: number, pixels: Uint8Array): void {
    this.board.set(new Board(width, height, this.#palette, pixels));
    const inspected = this.inspected();
    if (inspected) this.inspect(inspected);
  }

  #pixels(frame: Uint8Array): void {
    const board = this.board();
    if (!board) return;
    const inspected = this.inspected();
    let inspectedChanged = false;
    decodePixelsFrame(frame, (x, y, color) => {
      board.set(x, y, color);
      if (inspected && inspected.x === x && inspected.y === y) inspectedChanged = true;
    });
    if (inspectedChanged) this.#refreshInfoSoon();
  }

  #message(message: ControlMessage): void {
    switch (message.type) {
      case 'placeResult': {
        this.cooldownEndsAt.set(this.#now() + message.cooldownRemainingMs);
        if (message.color !== null) this.board()?.set(message.x, message.y, message.color);
        if (!message.ok) {
          this.onNotice(
            message.error === 'cooldown'
              ? 'Not so fast! Your cooldown is still running.'
              : (PLACE_ERRORS[message.error ?? ''] ?? 'That pixel could not be placed.'),
          );
        }
        if (this.#isInspected(message.x, message.y)) this.#refreshInfoSoon();
        break;
      }
      case 'pixelInfo':
        if (this.#isInspected(message.x, message.y)) this.pixelInfo.set(message);
        break;
      case 'online':
        this.online.set(message.count);
        break;
      case 'error':
        this.onNotice(message.message);
        break;
    }
  }

  #isInspected(x: number, y: number): boolean {
    const inspected = this.inspected();
    return inspected !== null && inspected.x === x && inspected.y === y;
  }

  /** Re-fetches the inspected pixel's details after it changed, at most twice a second. */
  #refreshInfoSoon(): void {
    if (this.#infoRefresh !== null) return;
    this.#infoRefresh = setTimeout(() => {
      this.#infoRefresh = null;
      const pixel = this.inspected();
      if (pixel) this.#connection.send({ type: 'info', x: pixel.x, y: pixel.y });
    }, 500);
  }
}
