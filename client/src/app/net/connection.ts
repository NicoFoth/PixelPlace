import {
  FRAME_PIXELS,
  FRAME_SNAPSHOT,
  PROTOCOL_VERSION,
  decodeSnapshotFrame,
  type ClientMessage,
  type HelloMessage,
  type ServerMessage,
} from '@shared/protocol';

export type ConnectionState =
  /** Opening a socket (attempt 0 is the first try). */
  | { status: 'connecting'; attempt: number }
  /** Connected, and the canvas snapshot has arrived. */
  | { status: 'open' }
  /** Disconnected; the next attempt starts at `retryAt` (Date.now() time). */
  | { status: 'waiting'; attempt: number; retryAt: number; everConnected: boolean }
  /** Gave up for a reason retrying won't fix. */
  | { status: 'failed'; message: string }
  /** Closed on purpose. */
  | { status: 'closed' };

export type ControlMessage = Exclude<ServerMessage, HelloMessage>;

export interface ConnectionHandler {
  state(state: ConnectionState): void;
  hello(message: HelloMessage): void;
  /** A full canvas; replaces everything the client had. */
  snapshot(width: number, height: number, pixels: Uint8Array): void;
  /** A raw pixels frame (decode with decodePixelsFrame). */
  pixels(frame: Uint8Array): void;
  message(message: ControlMessage): void;
}

/** The subset of the browser WebSocket API this class uses. */
export interface SocketLike {
  binaryType: BinaryType;
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface ConnectionOptions {
  createSocket?: (url: string) => SocketLike;
  gunzip?: (data: Uint8Array) => Promise<Uint8Array>;
  now?: () => number;
  /** Delay before reconnect attempt `n` (1-based). */
  retryDelay?: (attempt: number) => number;
  /** How long the WebSocket handshake may take before the attempt counts as failed. */
  openTimeoutMs?: number;
}

const OPEN = 1;
/** Browsers can take minutes to give up on an unreachable host; don't wait that long. */
const DEFAULT_OPEN_TIMEOUT_MS = 10_000;

/**
 * One logical connection to a PixelPlace server, reconnecting with backoff.
 *
 * Messages are processed strictly in arrival order through a promise queue:
 * decompressing a snapshot is asynchronous, and pixel updates that arrive
 * meanwhile must be applied after it, not before.
 */
export class Connection {
  readonly url: string;
  readonly #handler: ConnectionHandler;
  readonly #createSocket: (url: string) => SocketLike;
  readonly #gunzip: (data: Uint8Array) => Promise<Uint8Array>;
  readonly #now: () => number;
  readonly #retryDelay: (attempt: number) => number;
  readonly #openTimeoutMs: number;

  #socket: SocketLike | null = null;
  /** Incremented per socket; work queued for an older socket is dropped. */
  #generation = 0;
  #queue: Promise<void> = Promise.resolve();
  #attempt = 0;
  #everConnected = false;
  #ready = false;
  #stopped = false;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #openTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, handler: ConnectionHandler, options: ConnectionOptions = {}) {
    this.url = url;
    this.#handler = handler;
    this.#createSocket = options.createSocket ?? ((target) => new WebSocket(target));
    this.#gunzip = options.gunzip ?? gunzip;
    this.#now = options.now ?? Date.now;
    this.#retryDelay = options.retryDelay ?? defaultRetryDelay;
    this.#openTimeoutMs = options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
  }

  start(): void {
    this.#stopped = false;
    this.#open();
  }

  /** Sends a message if the connection is fully open; returns whether it was sent. */
  send(message: ClientMessage): boolean {
    if (!this.#ready || this.#socket?.readyState !== OPEN) return false;
    this.#socket.send(JSON.stringify(message));
    return true;
  }

  /** Skips the remaining backoff delay. */
  retryNow(): void {
    if (this.#stopped || this.#retryTimer === null) return;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#open();
  }

  close(): void {
    this.#stopped = true;
    this.#teardown();
    this.#handler.state({ status: 'closed' });
  }

  #open(): void {
    this.#teardown();
    const generation = this.#generation;
    this.#handler.state({ status: 'connecting', attempt: this.#attempt });

    let socket: SocketLike;
    try {
      socket = this.#createSocket(this.url);
    } catch (error) {
      // Thrown synchronously for invalid URLs and blocked mixed content.
      const detail =
        typeof error === 'object' && error !== null && 'message' in error ? error.message : error;
      this.#fail(`The browser refused to connect to ${this.url}: ${String(detail)}`);
      return;
    }
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => this.#clearOpenTimer();
    socket.onmessage = (event) => this.#enqueue(generation, event.data);
    socket.onclose = () => this.#lost(generation);
    socket.onerror = () => {}; // always followed by close
    this.#socket = socket;
    this.#openTimer = setTimeout(() => this.#lost(generation), this.#openTimeoutMs);
  }

  #enqueue(generation: number, data: unknown): void {
    this.#queue = this.#queue
      .then(() => (generation === this.#generation ? this.#process(generation, data) : undefined))
      .catch((error: unknown) => {
        if (generation !== this.#generation) return;
        console.error('PixelPlace: bad message from server', error);
        this.#socket?.close(4000, 'Protocol error');
      });
  }

  async #process(generation: number, data: unknown): Promise<void> {
    if (typeof data === 'string') {
      const message = JSON.parse(data) as ServerMessage;
      if (message.type === 'hello') {
        if (message.protocol !== PROTOCOL_VERSION) {
          this.#fail(
            `This server speaks protocol version ${message.protocol}, but this client only knows version ${PROTOCOL_VERSION}.`,
          );
          return;
        }
        this.#handler.hello(message);
      } else if (this.#ready) {
        this.#handler.message(message);
      }
      return;
    }

    const frame =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(await (data as Blob).arrayBuffer());
    if (frame[0] === FRAME_SNAPSHOT) {
      const { width, height, gzipped } = decodeSnapshotFrame(frame);
      const pixels = await this.#gunzip(gzipped);
      if (generation !== this.#generation) return;
      if (pixels.length !== width * height) throw new Error('Snapshot has the wrong size');
      this.#handler.snapshot(width, height, pixels);
      this.#ready = true;
      this.#attempt = 0;
      this.#everConnected = true;
      this.#handler.state({ status: 'open' });
    } else if (frame[0] === FRAME_PIXELS && this.#ready) {
      this.#handler.pixels(frame);
    }
  }

  #lost(generation: number): void {
    if (generation !== this.#generation || this.#stopped) return;
    this.#teardown();
    this.#attempt += 1;
    const retryAt = this.#now() + this.#retryDelay(this.#attempt);
    this.#handler.state({
      status: 'waiting',
      attempt: this.#attempt,
      retryAt,
      everConnected: this.#everConnected,
    });
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.#open();
    }, retryAt - this.#now());
  }

  #fail(message: string): void {
    this.#stopped = true;
    this.#teardown();
    this.#handler.state({ status: 'failed', message });
  }

  /** Forgets the current socket and anything still queued for it. */
  #teardown(): void {
    this.#generation += 1;
    this.#ready = false;
    this.#clearOpenTimer();
    if (this.#retryTimer !== null) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    if (socket) {
      socket.onmessage = socket.onclose = socket.onerror = socket.onopen = null;
      socket.close(1000);
    }
  }

  #clearOpenTimer(): void {
    if (this.#openTimer !== null) {
      clearTimeout(this.#openTimer);
      this.#openTimer = null;
    }
  }
}

/** 0.5 s, 1 s, 2 s, … capped at 30 s, with ±20% jitter. */
export function defaultRetryDelay(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** (attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
