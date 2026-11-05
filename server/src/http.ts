import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { WS_PATH } from '../../shared/protocol.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

/** Build output with a content hash in its name (e.g. main-AB12CD34.js) never changes. */
const HASHED_ASSET = /-[A-Z0-9]{8}\.(?:js|mjs|css)$/;

/**
 * Serves the built client (if any), plus:
 * - /config.json: tells the bundled client to connect back to this server
 * - /healthz:     liveness probe
 */
export function createRequestHandler(clientDir: string | null): (req: IncomingMessage, res: ServerResponse) => void {
  const root = clientDir === null ? null : resolve(clientDir);
  return (req, res) => {
    handle(root, req, res).catch((error: unknown) => {
      console.error('HTTP request failed:', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  };
}

async function handle(root: string | null, req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    sendText(res, 400, 'Bad request');
    return;
  }

  if (pathname === '/healthz') {
    sendText(res, 200, 'ok');
    return;
  }
  if (pathname === '/config.json') {
    res.writeHead(200, { 'Content-Type': MIME_TYPES['.json'], 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ defaultServer: '/' }));
    return;
  }

  const index = root === null ? null : join(root, 'index.html');
  if (root === null || index === null || (await fileSize(index)) === null) {
    if (pathname === '/') {
      sendText(
        res,
        200,
        `PixelPlace server is running.\nWebSocket endpoint: ${WS_PATH}\n` +
          'No client build was found, so no website is served here. Build the client or set CLIENT_DIR.\n',
      );
    } else {
      sendText(res, 404, 'Not found');
    }
    return;
  }

  const filePath = resolve(root, `.${pathname}`);
  if (pathname.includes('\0') || (filePath !== root && !filePath.startsWith(root + sep))) {
    sendText(res, 404, 'Not found');
    return;
  }

  const size = await fileSize(filePath);
  if (size !== null) {
    serveFile(req, res, filePath, size);
  } else if (extname(pathname) === '') {
    // Unknown route without a file extension: let the client app handle it.
    serveFile(req, res, index, (await fileSize(index)) ?? 0);
  } else {
    sendText(res, 404, 'Not found');
  }
}

function serveFile(req: IncomingMessage, res: ServerResponse, filePath: string, size: number): void {
  const extension = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': cacheControl(filePath, extension),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath)
    .on('error', () => res.destroy())
    .pipe(res);
}

function cacheControl(filePath: string, extension: string): string {
  if (extension === '.html') return 'no-cache';
  if (HASHED_ASSET.test(filePath)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

async function fileSize(filePath: string): Promise<number | null> {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': MIME_TYPES['.txt'], 'Cache-Control': 'no-cache' });
  res.end(body);
}
