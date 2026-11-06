import { WS_PATH } from '@shared/protocol';

/** A resolved PixelPlace server. */
export interface ServerAddress {
  /** WebSocket endpoint, e.g. "wss://example.com/ws". */
  wsUrl: string;
  /** Short name for display, e.g. "example.com". */
  label: string;
  /**
   * How to refer to this server in a shareable link or the recent-servers
   * list, or null when it is the server hosting this page.
   */
  param: string | null;
}

/** The parts of the current page that affect how addresses resolve. */
export interface PageLocation {
  protocol: string;
  /** Base URL of the app (document.baseURI). */
  baseUrl: string;
}

export class ServerAddressError extends Error {
  override name = 'ServerAddressError';
}

/** The value a deployment's config.json uses to mean "the server hosting this page". */
export const SAME_ORIGIN = '/';

/**
 * Resolves what a user typed (or a ?server= link, or config.json) into a
 * WebSocket URL. Accepts bare hosts ("example.com", "localhost:8080"),
 * http(s):// and ws(s):// URLs, with or without the /ws path.
 */
export function resolveServer(input: string, page: PageLocation): ServerAddress {
  const raw = input.trim();
  if (raw === SAME_ORIGIN) {
    const base = new URL('./', page.baseUrl);
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return {
      wsUrl: `${scheme}//${base.host}${base.pathname}${WS_PATH.slice(1)}`,
      label: base.host,
      param: null,
    };
  }
  if (!raw) throw new ServerAddressError('Enter the address of a PixelPlace server.');

  const secure = page.protocol === 'https:';
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  let url: URL;
  try {
    url = new URL(hasScheme ? raw : `${secure ? 'wss' : 'ws'}://${raw}`);
  } catch {
    throw new ServerAddressError(`"${raw}" doesn't look like a server address.`);
  }

  const scheme = { 'http:': 'ws:', 'https:': 'wss:', 'ws:': 'ws:', 'wss:': 'wss:' }[url.protocol];
  if (!scheme || !url.hostname) {
    throw new ServerAddressError(`"${raw}" doesn't look like a server address.`);
  }
  if (secure && scheme === 'ws:' && !isLoopback(url.hostname)) {
    throw new ServerAddressError(
      'This page was loaded over HTTPS, so browsers only allow secure (wss://) servers. ' +
        "Use the server's HTTPS address, or open this client over http:// instead.",
    );
  }

  const path = url.pathname.replace(/\/+$/, '').replace(/\/ws$/, '');
  const hostAndPath = `${url.host}${path}`;
  const defaultScheme = secure ? 'wss:' : 'ws:';
  return {
    wsUrl: `${scheme}//${hostAndPath}${WS_PATH}`,
    label: hostAndPath,
    param: scheme === defaultScheme ? hostAndPath : `${scheme}//${hostAndPath}`,
  };
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127\.\d+\.\d+\.\d+$/.test(hostname)
  );
}
