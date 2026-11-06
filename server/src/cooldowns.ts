/**
 * Tracks when each client last placed a pixel. Kept in memory on purpose:
 * forgetting cooldowns on restart is harmless.
 */
export class Cooldowns {
  readonly cooldownMs: number;
  readonly #lastPlacedAt = new Map<string, number>();

  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs;
  }

  /** Milliseconds until `key` may place again (0 = now). */
  remaining(key: string, now: number): number {
    const last = this.#lastPlacedAt.get(key);
    if (last === undefined) return 0;
    return Math.max(0, last + this.cooldownMs - now);
  }

  record(key: string, now: number): void {
    this.#lastPlacedAt.set(key, now);
  }

  /** Forgets entries whose cooldown has expired so the map cannot grow forever. */
  prune(now: number): void {
    for (const [key, last] of this.#lastPlacedAt) {
      if (last + this.cooldownMs <= now) this.#lastPlacedAt.delete(key);
    }
  }

  get size(): number {
    return this.#lastPlacedAt.size;
  }
}
