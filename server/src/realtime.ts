import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  PROTOCOL_VERSION,
  WS_PATH,
  encodePixelsFrame,
  type HelloMessage,
  type ServerMessage,
} from '../../shared/protocol.ts';
import type { Canvas } from './canvas.ts';
import type { Game } from './game.ts';
import { clientAddress, cooldownKey } from './ip.ts';

export interface RealtimeOptions {
  game: Game;
  canvas: Canvas;
  palette: readonly string[];
  cooldownMs: number;
  trustProxy: boolean;
  maxConnectionsPerIp: number;
  /** How long pixel updates are collected before being broadcast. */
  batchIntervalMs?: number;
  /** How often idle connections are pinged; dead ones are dropped. */
  heartbeatIntervalMs?: number;
  /** Delay before the online count is re-broadcast after joins/leaves. */
  onlineBroadcastDelayMs?: number;
  /** Token bucket per connection: burst size and refill rate. */
  rateLimit?: { burst: number; perSecond: number };
}

interface Client {
  socket: WebSocket;
  key: string;
  tokens: number;
  lastRefill: number;
  alive: boolean;
}

/** Messages are tiny JSON objects; anything bigger is abuse. */
const MAX_MESSAGE_BYTES = 1024;
/** Drop clients that cannot keep up instead of buffering for them forever. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/** The WebSocket side of the server: snapshots, broadcasts and requests. */
export class Realtime {
  readonly #options: Required<RealtimeOptions>;
  readonly #wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
    clientTracking: false,
  });
  readonly #clients = new Set<Client>();
  readonly #connectionsPerKey = new Map<string, number>();
  #pending: number[] = [];
  #flushTimer: NodeJS.Timeout | null = null;
  #onlineTimer: NodeJS.Timeout | null = null;
  readonly #heartbeatTimer: NodeJS.Timeout;

  constructor(server: Server, options: RealtimeOptions) {
    this.#options = {
      batchIntervalMs: 50,
      heartbeatIntervalMs: 30_000,
      onlineBroadcastDelayMs: 1000,
      rateLimit: { burst: 30, perSecond: 10 },
      ...options,
    };
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => this.#handleUpgrade(req, socket, head));
    this.#heartbeatTimer = setInterval(() => this.#checkHeartbeats(), this.#options.heartbeatIntervalMs);
    this.#heartbeatTimer.unref();
  }

  get online(): number {
    return this.#clients.size;
  }

  /** Queues an accepted placement for the next broadcast batch. */
  queuePixel(x: number, y: number, color: number): void {
    this.#pending.push(x, y, color);
    this.#flushTimer ??= setTimeout(() => this.#flush(), this.#options.batchIntervalMs);
  }

  /** Flushes pending pixels, then closes every connection. */
  async close(): Promise<void> {
    clearInterval(this.#heartbeatTimer);
    if (this.#onlineTimer) clearTimeout(this.#onlineTimer);
    this.#flush();
    const closed = [...this.#clients].map(
      (client) =>
        new Promise<void>((done) => {
          client.socket.once('close', () => done());
          client.socket.close(1001, 'Server shutting down');
        }),
    );
    const timeout = new Promise<void>((done) => setTimeout(done, 1000).unref());
    await Promise.race([Promise.all(closed), timeout]);
    for (const client of this.#clients) client.socket.terminate();
    await new Promise<void>((done) => this.#wss.close(() => done()));
  }

  #handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (pathname !== WS_PATH) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    const key = cooldownKey(clientAddress(req, this.#options.trustProxy));
    const connections = this.#connectionsPerKey.get(key) ?? 0;
    if (connections >= this.#options.maxConnectionsPerIp) {
      rejectUpgrade(socket, 429, 'Too Many Requests');
      return;
    }
    // Count the connection from the start of the upgrade; the raw socket's
    // close event fires whether the upgrade succeeds or fails.
    this.#connectionsPerKey.set(key, connections + 1);
    socket.once('close', () => {
      const remaining = (this.#connectionsPerKey.get(key) ?? 1) - 1;
      if (remaining > 0) this.#connectionsPerKey.set(key, remaining);
      else this.#connectionsPerKey.delete(key);
    });

    this.#wss.handleUpgrade(req, socket, head, (ws) => this.#accept(ws, key));
  }

  #accept(socket: WebSocket, key: string): void {
    const { burst } = this.#options.rateLimit;
    const client: Client = { socket, key, tokens: burst, lastRefill: Date.now(), alive: true };

    // hello and snapshot go out in the same tick that the client joins the
    // broadcast set, so every later update reaches it after the snapshot.
    const hello: HelloMessage = {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      width: this.#options.canvas.width,
      height: this.#options.canvas.height,
      palette: [...this.#options.palette],
      cooldownMs: this.#options.cooldownMs,
      cooldownRemainingMs: this.#options.game.cooldownRemaining(key),
      online: this.#clients.size + 1,
    };
    sendJson(socket, hello);
    socket.send(this.#options.canvas.snapshotFrame());
    this.#clients.add(client);
    this.#scheduleOnlineBroadcast();

    socket.on('message', (data, isBinary) => this.#handleMessage(client, data, isBinary));
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      this.#clients.delete(client);
      this.#scheduleOnlineBroadcast();
    });
  }

  #handleMessage(client: Client, data: RawData, isBinary: boolean): void {
    if (!this.#takeToken(client)) {
      client.socket.close(1008, 'Rate limit exceeded');
      return;
    }
    if (isBinary) {
      client.socket.close(1003, 'Binary messages are not supported');
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(rawToString(data));
    } catch {
      sendJson(client.socket, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    if (typeof message !== 'object' || message === null) {
      sendJson(client.socket, { type: 'error', message: 'Expected a JSON object' });
      return;
    }

    const request = message as Record<string, unknown>;
    switch (request['type']) {
      case 'place':
        sendJson(
          client.socket,
          this.#options.game.place(client.key, request['x'], request['y'], request['color'], request['nickname']),
        );
        break;
      case 'info':
        sendJson(
          client.socket,
          this.#options.game.info(request['x'], request['y']) ?? { type: 'error', message: 'Coordinates out of bounds' },
        );
        break;
      default:
        sendJson(client.socket, { type: 'error', message: 'Unknown message type' });
    }
  }

  #takeToken(client: Client): boolean {
    const { burst, perSecond } = this.#options.rateLimit;
    const now = Date.now();
    client.tokens = Math.min(burst, client.tokens + ((now - client.lastRefill) / 1000) * perSecond);
    client.lastRefill = now;
    if (client.tokens < 1) return false;
    client.tokens -= 1;
    return true;
  }

  #flush(): void {
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    if (this.#pending.length === 0) return;
    const frame = encodePixelsFrame(this.#pending);
    this.#pending = [];
    for (const client of this.#clients) send(client.socket, frame);
  }

  #scheduleOnlineBroadcast(): void {
    this.#onlineTimer ??= setTimeout(() => {
      this.#onlineTimer = null;
      const message = JSON.stringify({ type: 'online', count: this.#clients.size } satisfies ServerMessage);
      for (const client of this.#clients) send(client.socket, message);
    }, this.#options.onlineBroadcastDelayMs);
  }

  #checkHeartbeats(): void {
    for (const client of this.#clients) {
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }
}

function send(socket: WebSocket, data: string | Uint8Array): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    socket.terminate();
    return;
  }
  socket.send(data);
}

function sendJson(socket: WebSocket, message: ServerMessage): void {
  send(socket, JSON.stringify(message));
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data as ArrayBuffer).toString('utf8');
}

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
