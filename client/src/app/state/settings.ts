import { Injectable, effect, signal } from '@angular/core';
import { MAX_NICKNAME_LENGTH } from '@shared/protocol';

const STORAGE_KEY = 'pixelplace.settings.v1';
const MAX_RECENT_SERVERS = 6;

interface StoredSettings {
  nickname: string;
  color: number | null;
  recentServers: string[];
}

/** Preferences kept in this browser's localStorage. */
@Injectable({ providedIn: 'root' })
export class Settings {
  readonly #stored = load();
  /** Optional display name sent with placements; empty means anonymous. */
  readonly nickname = signal(this.#stored.nickname);
  /** Selected palette index, or null for "inspect" mode. */
  readonly color = signal<number | null>(this.#stored.color);
  /** Servers connected to recently, most recent first. */
  readonly recentServers = signal<readonly string[]>(this.#stored.recentServers);

  constructor() {
    effect(() => {
      save({
        nickname: this.nickname(),
        color: this.color(),
        recentServers: [...this.recentServers()],
      });
    });
  }

  rememberServer(server: string): void {
    this.recentServers.update((list) =>
      [server, ...list.filter((s) => s !== server)].slice(0, MAX_RECENT_SERVERS),
    );
  }

  forgetServer(server: string): void {
    this.recentServers.update((list) => list.filter((s) => s !== server));
  }
}

function load(): StoredSettings {
  const fallback: StoredSettings = { nickname: '', color: null, recentServers: [] };
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    const value = parsed as Partial<Record<keyof StoredSettings, unknown>>;
    return {
      nickname:
        typeof value.nickname === 'string' ? value.nickname.slice(0, MAX_NICKNAME_LENGTH * 2) : '',
      color: Number.isInteger(value.color) ? (value.color as number) : null,
      recentServers: Array.isArray(value.recentServers)
        ? value.recentServers
            .filter((s): s is string => typeof s === 'string')
            .slice(0, MAX_RECENT_SERVERS)
        : [],
    };
  } catch {
    return fallback; // storage disabled or corrupted
  }
}

function save(settings: StoredSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or quota: settings just won't persist.
  }
}
