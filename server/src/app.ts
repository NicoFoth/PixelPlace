import { mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { DEFAULT_PALETTE } from '../../shared/protocol.ts';
import { Canvas } from './canvas.ts';
import type { Config } from './config.ts';
import { Cooldowns } from './cooldowns.ts';
import { Game } from './game.ts';
import { createRequestHandler } from './http.ts';
import { Realtime, type RealtimeOptions } from './realtime.ts';
import { Store } from './store.ts';

export interface App {
  readonly server: Server;
  readonly realtime: Realtime;
  /** Starts listening; resolves with the bound port. */
  start(): Promise<number>;
  /** Closes connections and the database. */
  stop(): Promise<void>;
}

export interface AppOptions {
  now?: () => number;
  /** Overrides for timing knobs (used by tests). */
  realtime?: Partial<Pick<RealtimeOptions, 'batchIntervalMs' | 'heartbeatIntervalMs' | 'onlineBroadcastDelayMs' | 'rateLimit'>>;
}

/** Thrown when the data directory or database can't be opened (usually permissions). */
export class DataDirError extends Error {
  constructor(dataDir: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Can't open the database in ${dataDir} (${detail}). ` +
        'The server needs to be able to create and write files in DATA_DIR.',
      { cause },
    );
  }
}

export function createApp(config: Config, options: AppOptions = {}): App {
  let store: Store;
  try {
    mkdirSync(config.dataDir, { recursive: true });
    store = new Store(join(config.dataDir, 'pixelplace.db'));
  } catch (error) {
    throw new DataDirError(config.dataDir, error);
  }
  const canvas = new Canvas(config.width, config.height);
  try {
    store.loadPixels(canvas.pixels, config.width, config.height);
  } catch (error) {
    store.close();
    throw error;
  }
  canvas.invalidate();

  const cooldowns = new Cooldowns(config.cooldownMs);
  const server = createServer(createRequestHandler(config.clientDir));
  const palette = DEFAULT_PALETTE;

  // Game reports accepted pixels to Realtime, which is created right after.
  let realtime: Realtime | undefined;
  const game = new Game({
    canvas,
    store,
    cooldowns,
    palette,
    now: options.now,
    onPixel: (x, y, color) => realtime?.queuePixel(x, y, color),
  });
  realtime = new Realtime(server, {
    game,
    canvas,
    palette,
    cooldownMs: config.cooldownMs,
    trustProxy: config.trustProxy,
    maxConnectionsPerIp: config.maxConnectionsPerIp,
    ...options.realtime,
  });

  const pruneTimer = setInterval(() => cooldowns.prune(Date.now()), 60_000);
  pruneTimer.unref();

  const app: App = {
    server,
    realtime,
    start: () =>
      new Promise<number>((resolveStart, rejectStart) => {
        server.once('error', rejectStart);
        server.listen(config.port, config.host, () => {
          server.off('error', rejectStart);
          resolveStart((server.address() as AddressInfo).port);
        });
      }),
    stop: async () => {
      clearInterval(pruneTimer);
      await realtime.close();
      await new Promise<void>((done) => server.close(() => done()));
      store.close();
    },
  };
  return app;
}
