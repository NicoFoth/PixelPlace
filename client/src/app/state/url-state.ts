/** A camera position as stored in a shareable link. */
export interface UrlView {
  x: number;
  y: number;
  /** Null when the link doesn't specify a zoom. */
  zoom: number | null;
}

export interface UrlState {
  server: string | null;
  view: UrlView | null;
}

/** Reads ?server=…&x=…&y=…&z=… from a query string. */
export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const server = params.get('server')?.trim() || null;
  const x = parseNumber(params.get('x'));
  const y = parseNumber(params.get('y'));
  const zoom = parseNumber(params.get('z'));
  const view =
    x !== null && y !== null ? { x, y, zoom: zoom !== null && zoom > 0 ? zoom : null } : null;
  return { server, view };
}

/**
 * Writes the app's parameters into a query string, keeping any unrelated
 * parameters. `:` and `/` are left unescaped so server addresses stay readable.
 */
export function formatUrlSearch(state: UrlState, currentSearch = ''): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of ['server', 'x', 'y', 'z']) params.delete(key);
  if (state.server) params.set('server', state.server);
  if (state.view) {
    params.set('x', String(Math.floor(state.view.x)));
    params.set('y', String(Math.floor(state.view.y)));
    if (state.view.zoom !== null) params.set('z', String(Math.round(state.view.zoom * 100) / 100));
  }
  const query = params.toString().replace(/%3A/gi, ':').replace(/%2F/gi, '/');
  return query ? `?${query}` : '';
}

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
