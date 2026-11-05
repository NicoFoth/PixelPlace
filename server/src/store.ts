import { randomBytes } from 'node:crypto';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export interface PixelRecord {
  color: number;
  nickname: string | null;
  placedAt: number;
}

export interface Placement {
  x: number;
  y: number;
  color: number;
  nickname: string | null;
  /** Pseudonymous id of the placer (a keyed hash, never the raw IP). */
  actor: string;
  placedAt: number;
}

/** Thrown when the database holds pixels outside the configured canvas. */
export class CanvasTooSmallError extends Error {
  readonly requiredWidth: number;
  readonly requiredHeight: number;

  constructor(requiredWidth: number, requiredHeight: number) {
    super(
      `The saved canvas has pixels up to ${requiredWidth}x${requiredHeight}; ` +
        `set WIDTH >= ${requiredWidth} and HEIGHT >= ${requiredHeight} (shrinking would cut off pixels).`,
    );
    this.requiredWidth = requiredWidth;
    this.requiredHeight = requiredHeight;
  }
}

const SCHEMA_VERSION = 1;

/** SQLite persistence: the current pixel state plus an append-only history. */
export class Store {
  readonly #db: DatabaseSync;
  readonly #upsertPixel: StatementSync;
  readonly #insertPlacement: StatementSync;
  readonly #selectPixel: StatementSync;

  /** @param filename a file path, or ":memory:" for tests */
  constructor(filename: string) {
    this.#db = new DatabaseSync(filename);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pixels (
        x         INTEGER NOT NULL,
        y         INTEGER NOT NULL,
        color     INTEGER NOT NULL,
        nickname  TEXT,
        placed_at INTEGER NOT NULL,
        PRIMARY KEY (x, y)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS placements (
        id        INTEGER PRIMARY KEY,
        x         INTEGER NOT NULL,
        y         INTEGER NOT NULL,
        color     INTEGER NOT NULL,
        nickname  TEXT,
        actor     TEXT NOT NULL,
        placed_at INTEGER NOT NULL
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    this.#upsertPixel = this.#db.prepare(`
      INSERT INTO pixels (x, y, color, nickname, placed_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (x, y) DO UPDATE SET
        color = excluded.color, nickname = excluded.nickname, placed_at = excluded.placed_at
    `);
    this.#insertPlacement = this.#db.prepare(
      'INSERT INTO placements (x, y, color, nickname, actor, placed_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    this.#selectPixel = this.#db.prepare('SELECT color, nickname, placed_at FROM pixels WHERE x = ? AND y = ?');
  }

  /**
   * Copies the saved pixels into `target` (row-major, `width` wide).
   * @throws CanvasTooSmallError if saved pixels fall outside width x height
   */
  loadPixels(target: Uint8Array, width: number, height: number): number {
    const bounds = this.#db.prepare('SELECT max(x) AS maxX, max(y) AS maxY FROM pixels').get();
    const maxX = bounds?.['maxX'];
    const maxY = bounds?.['maxY'];
    if (typeof maxX === 'number' && typeof maxY === 'number' && (maxX >= width || maxY >= height)) {
      throw new CanvasTooSmallError(Math.max(width, maxX + 1), Math.max(height, maxY + 1));
    }
    let count = 0;
    for (const row of this.#db.prepare('SELECT x, y, color FROM pixels').iterate()) {
      target[(row['y'] as number) * width + (row['x'] as number)] = row['color'] as number;
      count++;
    }
    return count;
  }

  /** Records a placement atomically: either both tables change or neither. */
  savePlacement(placement: Placement): void {
    const { x, y, color, nickname, actor, placedAt } = placement;
    this.#db.exec('BEGIN');
    try {
      this.#upsertPixel.run(x, y, color, nickname, placedAt);
      this.#insertPlacement.run(x, y, color, nickname, actor, placedAt);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  getPixel(x: number, y: number): PixelRecord | null {
    const row = this.#selectPixel.get(x, y);
    if (!row) return null;
    return {
      color: row['color'] as number,
      nickname: (row['nickname'] as string | null) ?? null,
      placedAt: row['placed_at'] as number,
    };
  }

  /** A random per-server secret used to pseudonymise placers; created on first use. */
  actorSecret(): string {
    const row = this.#db.prepare("SELECT value FROM meta WHERE key = 'actor_secret'").get();
    if (row) return row['value'] as string;
    const secret = randomBytes(32).toString('hex');
    this.#db.prepare("INSERT INTO meta (key, value) VALUES ('actor_secret', ?)").run(secret);
    return secret;
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close();
  }
}
