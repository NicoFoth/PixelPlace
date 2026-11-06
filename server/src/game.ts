import { createHmac } from 'node:crypto';
import {
  isInBounds,
  normalizeNickname,
  type PixelInfoMessage,
  type PlaceResultMessage,
} from '../../shared/protocol.ts';
import type { Canvas } from './canvas.ts';
import type { Cooldowns } from './cooldowns.ts';
import type { Store } from './store.ts';

export interface GameOptions {
  canvas: Canvas;
  store: Store;
  cooldowns: Cooldowns;
  palette: readonly string[];
  /** Called for every accepted placement, after it has been saved. */
  onPixel: (x: number, y: number, color: number) => void;
  now?: () => number;
}

/** The rules of the game, independent of any transport. */
export class Game {
  readonly #canvas: Canvas;
  readonly #store: Store;
  readonly #cooldowns: Cooldowns;
  readonly #paletteSize: number;
  readonly #onPixel: GameOptions['onPixel'];
  readonly #now: () => number;
  readonly #actorSecret: string;

  constructor(options: GameOptions) {
    this.#canvas = options.canvas;
    this.#store = options.store;
    this.#cooldowns = options.cooldowns;
    this.#paletteSize = options.palette.length;
    this.#onPixel = options.onPixel;
    this.#now = options.now ?? Date.now;
    this.#actorSecret = options.store.actorSecret();
  }

  cooldownRemaining(clientKey: string): number {
    return this.#cooldowns.remaining(clientKey, this.#now());
  }

  /**
   * Attempts a placement. Everything runs synchronously, so no other
   * placement can slip in between the cooldown check and the write.
   */
  place(clientKey: string, x: unknown, y: unknown, color: unknown, nickname: unknown): PlaceResultMessage {
    const now = this.#now();
    const remaining = this.#cooldowns.remaining(clientKey, now);
    if (!isInBounds(x, y, this.#canvas.width, this.#canvas.height)) {
      return reject('invalid', numberOr(x, -1), numberOr(y, -1), null, remaining);
    }
    const current = this.#canvas.get(x as number, y as number);
    if (!Number.isInteger(color) || (color as number) < 0 || (color as number) >= this.#paletteSize) {
      return reject('invalid', x as number, y as number, current, remaining);
    }
    if (remaining > 0) {
      return reject('cooldown', x as number, y as number, current, remaining);
    }

    try {
      this.#store.savePlacement({
        x: x as number,
        y: y as number,
        color: color as number,
        nickname: normalizeNickname(nickname),
        actor: this.#actor(clientKey),
        placedAt: now,
      });
    } catch (error) {
      console.error('Failed to save placement:', error);
      return reject('server_error', x as number, y as number, current, 0);
    }

    this.#cooldowns.record(clientKey, now);
    this.#canvas.set(x as number, y as number, color as number);
    this.#onPixel(x as number, y as number, color as number);
    return {
      type: 'placeResult',
      ok: true,
      x: x as number,
      y: y as number,
      color: color as number,
      cooldownRemainingMs: this.#cooldowns.cooldownMs,
    };
  }

  /** Who placed a pixel and when; null for out-of-bounds coordinates. */
  info(x: unknown, y: unknown): PixelInfoMessage | null {
    if (!isInBounds(x, y, this.#canvas.width, this.#canvas.height)) return null;
    const record = this.#store.getPixel(x as number, y as number);
    return {
      type: 'pixelInfo',
      x: x as number,
      y: y as number,
      color: this.#canvas.get(x as number, y as number),
      nickname: record?.nickname ?? null,
      placedAt: record?.placedAt ?? null,
    };
  }

  /** A stable pseudonym for a client so history can be audited without storing IPs. */
  #actor(clientKey: string): string {
    return createHmac('sha256', this.#actorSecret).update(clientKey).digest('hex').slice(0, 16);
  }
}

function reject(
  error: NonNullable<PlaceResultMessage['error']>,
  x: number,
  y: number,
  color: number | null,
  cooldownRemainingMs: number,
): PlaceResultMessage {
  return { type: 'placeResult', ok: false, error, x, y, color, cooldownRemainingMs };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
