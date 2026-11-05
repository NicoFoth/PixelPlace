import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_CANVAS_SIZE } from '../../shared/protocol.ts';

export interface Config {
  /** TCP port for HTTP and WebSocket traffic. */
  port: number;
  /** Interface to bind; undefined lets Node listen on all interfaces. */
  host: string | undefined;
  width: number;
  height: number;
  cooldownMs: number;
  /** Directory holding the SQLite database. */
  dataDir: string;
  /** Built client to serve at "/", or null to serve no website. */
  clientDir: string | null;
  /** Read the client address from X-Forwarded-For (only behind a reverse proxy). */
  trustProxy: boolean;
  maxConnectionsPerIp: number;
}

export class ConfigError extends Error {}

const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../../client/dist', import.meta.url));

/** Reads configuration from environment variables, validating every value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const clientDirSetting = env['CLIENT_DIR'];
  let clientDir: string | null;
  if (clientDirSetting === undefined) {
    clientDir = existsSync(DEFAULT_CLIENT_DIR) ? DEFAULT_CLIENT_DIR : null;
  } else if (clientDirSetting.trim() === '') {
    clientDir = null;
  } else {
    clientDir = resolve(clientDirSetting);
  }

  return {
    port: integer(env, 'PORT', 8080, 0, 65535),
    host: env['HOST']?.trim() || undefined,
    width: integer(env, 'WIDTH', 1000, 1, MAX_CANVAS_SIZE),
    height: integer(env, 'HEIGHT', 1000, 1, MAX_CANVAS_SIZE),
    cooldownMs: Math.round(number(env, 'COOLDOWN_SECONDS', 60, 0, 86_400) * 1000),
    dataDir: resolve(env['DATA_DIR']?.trim() || 'data'),
    clientDir,
    trustProxy: boolean(env, 'TRUST_PROXY', false),
    maxConnectionsPerIp: integer(env, 'MAX_CONNECTIONS_PER_IP', 10, 1, 10_000),
  };
}

function number(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be a number between ${min} and ${max} (got "${raw}")`);
  }
  return value;
}

function integer(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const value = number(env, name, fallback, min, max);
  if (!Number.isInteger(value)) {
    throw new ConfigError(`${name} must be a whole number (got "${env[name]}")`);
  }
  return value;
}

function boolean(env: Record<string, string | undefined>, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new ConfigError(`${name} must be true or false (got "${env[name]}")`);
}
