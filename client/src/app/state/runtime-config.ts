/**
 * Deployment settings read at startup from `config.json` next to index.html.
 *
 * The PixelPlace server answers `/config.json` itself with
 * `{"defaultServer": "/"}`, so a client served by a server connects to it
 * straight away. A client hosted elsewhere (any static host) ships the
 * `{"defaultServer": null}` default from `public/config.json`, which can be
 * edited after building to point at a server.
 */
export interface RuntimeConfig {
  /** Server to connect to when the link doesn't name one; "/" means this page's host. */
  defaultServer: string | null;
}

export async function loadRuntimeConfig(fetcher: typeof fetch = fetch): Promise<RuntimeConfig> {
  try {
    const response = await fetcher('config.json', { cache: 'no-cache' });
    if (!response.ok) return { defaultServer: null };
    const data: unknown = await response.json();
    const server =
      data && typeof data === 'object' ? (data as Record<string, unknown>)['defaultServer'] : null;
    return { defaultServer: typeof server === 'string' && server.trim() ? server.trim() : null };
  } catch {
    return { defaultServer: null };
  }
}
