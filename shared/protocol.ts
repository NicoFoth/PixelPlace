/**
 * Wire protocol shared by the PixelPlace server and client.
 *
 * Node runs this file directly (type stripping) and the Angular compiler
 * bundles it into the client, so it must stay free of imports and of
 * non-erasable TypeScript syntax (no enums, namespaces or parameter
 * properties).
 *
 * Transport: a single WebSocket at {@link WS_PATH}.
 * - Text frames carry JSON control messages in both directions.
 * - Binary frames (server -> client only) carry canvas data:
 *   - snapshot: [FRAME_SNAPSHOT][width u16][height u16][gzip(width*height palette indices)]
 *   - pixels:   [FRAME_PIXELS]([x u16][y u16][color u8])*
 *   All integers are big-endian. Pixel data is row-major (index = y * width + x).
 */

export const PROTOCOL_VERSION = 1;

/** Path of the WebSocket endpoint on a PixelPlace server. */
export const WS_PATH = '/ws';

/** Largest supported canvas edge (coordinates are encoded as uint16). */
export const MAX_CANVAS_SIZE = 4096;

/** Longest nickname the server stores. */
export const MAX_NICKNAME_LENGTH = 20;

/** Default palette. Index 0 is the background colour of an untouched canvas. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#FFFFFF', // white
  '#999999', // grey
  '#000000', // black
  '#9C6926', // brown
  '#FF355E', // red
  '#FD5B78', // pink
  '#FF6037', // red-orange
  '#FF9933', // orange
  '#FFFF66', // yellow
  '#CCFF00', // lime
  '#66FF66', // green
  '#16D0CB', // teal
  '#50BFE6', // sky blue
  '#2450A4', // dark blue
  '#9C27B0', // purple
  '#FF00CC', // magenta
];

// ---------------------------------------------------------------------------
// Client -> server (JSON text frames)
// ---------------------------------------------------------------------------

export interface PlaceRequest {
  type: 'place';
  x: number;
  y: number;
  color: number;
  /** Optional display name; empty or missing means "anonymous". */
  nickname?: string;
}

export interface InfoRequest {
  type: 'info';
  x: number;
  y: number;
}

export type ClientMessage = PlaceRequest | InfoRequest;

// ---------------------------------------------------------------------------
// Server -> client (JSON text frames)
// ---------------------------------------------------------------------------

/** First message on every connection; the snapshot frame follows it. */
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  width: number;
  height: number;
  /** CSS hex colours, indexed by palette index. */
  palette: string[];
  cooldownMs: number;
  /** Remaining cooldown for this client's address (0 = may place now). */
  cooldownRemainingMs: number;
  online: number;
}

export type PlaceError = 'cooldown' | 'invalid' | 'server_error';

export interface PlaceResultMessage {
  type: 'placeResult';
  ok: boolean;
  x: number;
  y: number;
  /**
   * The pixel's colour after the request was handled: the new colour on
   * success, the unchanged current colour on failure (so an optimistic client
   * can revert), or null if the coordinates were invalid.
   */
  color: number | null;
  cooldownRemainingMs: number;
  error?: PlaceError;
}

export interface PixelInfoMessage {
  type: 'pixelInfo';
  x: number;
  y: number;
  color: number;
  /** Null when the pixel was placed anonymously or never placed. */
  nickname: string | null;
  /** Unix epoch milliseconds, or null if the pixel was never placed. */
  placedAt: number | null;
}

export interface OnlineMessage {
  type: 'online';
  count: number;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | HelloMessage
  | PlaceResultMessage
  | PixelInfoMessage
  | OnlineMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// Binary frames
// ---------------------------------------------------------------------------

export const FRAME_SNAPSHOT = 1;
export const FRAME_PIXELS = 2;

const SNAPSHOT_HEADER_SIZE = 5;
const PIXEL_RECORD_SIZE = 5;

/** Builds a snapshot frame from already gzip-compressed pixel data. */
export function encodeSnapshotFrame(width: number, height: number, gzipped: Uint8Array): Uint8Array {
  const frame = new Uint8Array(SNAPSHOT_HEADER_SIZE + gzipped.length);
  frame[0] = FRAME_SNAPSHOT;
  writeU16(frame, 1, width);
  writeU16(frame, 3, height);
  frame.set(gzipped, SNAPSHOT_HEADER_SIZE);
  return frame;
}

export interface DecodedSnapshot {
  width: number;
  height: number;
  /** gzip-compressed palette indices. */
  gzipped: Uint8Array;
}

export function decodeSnapshotFrame(frame: Uint8Array): DecodedSnapshot {
  if (frame.length < SNAPSHOT_HEADER_SIZE || frame[0] !== FRAME_SNAPSHOT) {
    throw new Error('Not a snapshot frame');
  }
  return {
    width: readU16(frame, 1),
    height: readU16(frame, 3),
    gzipped: frame.subarray(SNAPSHOT_HEADER_SIZE),
  };
}

/** Encodes pixel updates given as a flat [x0, y0, c0, x1, y1, c1, ...] list. */
export function encodePixelsFrame(flat: ArrayLike<number>): Uint8Array {
  const count = Math.floor(flat.length / 3);
  const frame = new Uint8Array(1 + count * PIXEL_RECORD_SIZE);
  frame[0] = FRAME_PIXELS;
  for (let i = 0; i < count; i++) {
    const offset = 1 + i * PIXEL_RECORD_SIZE;
    writeU16(frame, offset, flat[i * 3]);
    writeU16(frame, offset + 2, flat[i * 3 + 1]);
    frame[offset + 4] = flat[i * 3 + 2];
  }
  return frame;
}

export function decodePixelsFrame(
  frame: Uint8Array,
  onPixel: (x: number, y: number, color: number) => void,
): void {
  if (frame.length < 1 || frame[0] !== FRAME_PIXELS || (frame.length - 1) % PIXEL_RECORD_SIZE !== 0) {
    throw new Error('Not a pixels frame');
  }
  for (let offset = 1; offset < frame.length; offset += PIXEL_RECORD_SIZE) {
    onPixel(readU16(frame, offset), readU16(frame, offset + 2), frame[offset + 4]);
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Cleans a user-supplied nickname: strips control characters, collapses
 * whitespace and truncates to {@link MAX_NICKNAME_LENGTH} characters.
 * Returns null for anything that ends up empty (shown as "anonymous").
 */
export function normalizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/\s+/gu, ' ') // newlines and tabs become spaces...
    .replace(/[\p{Cc}\p{Cf}]/gu, '') // ...then other invisible characters go
    .replace(/ {2,}/g, ' ')
    .trim();
  const truncated = Array.from(cleaned).slice(0, MAX_NICKNAME_LENGTH).join('').trim();
  return truncated.length > 0 ? truncated : null;
}

export function isInBounds(x: unknown, y: unknown, width: number, height: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    (x as number) >= 0 &&
    (y as number) >= 0 &&
    (x as number) < width &&
    (y as number) < height
  );
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 8) & 0xff;
  target[offset + 1] = value & 0xff;
}

function readU16(source: Uint8Array, offset: number): number {
  return (source[offset] << 8) | source[offset + 1];
}
