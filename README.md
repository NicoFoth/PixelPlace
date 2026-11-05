# PixelPlace

A shared pixel canvas for the browser: pick a colour, place a pixel, wait for your cooldown, repeat. Everyone connected to the same server sees each other's pixels appear live.

PixelPlace has two parts:

- **A server** you host yourself. It's a single Node.js process that holds the canvas, enforces a cooldown per IP address, stores everything in one SQLite file and also serves the website.
- **A web client** (Angular). The server serves it, but it is also a plain static site you can put on any static host and point at any PixelPlace server.

There are no accounts and no third-party services. Players can set a nickname (or stay anonymous). The nickname and the list of recent servers live only in their browser.

**Features**

- Live canvas, 1000×1000 by default
- Pan and zoom with mouse, trackpad, keyboard or touch (zoom stays anchored on the cursor or pinch point)
- 16-colour palette
- Reticle and coordinates under the cursor
- "Who placed this pixel?" details
- Count of people online
- Shareable links to an exact spot (`?server=…&x=…&y=…&z=…`)

## Quick start (Docker)

```sh
docker compose up -d
```

Open <http://localhost:8080>. The canvas is stored in the `pixelplace-data` volume and survives restarts and upgrades.

To change the canvas size, the cooldown or the port, copy `.env.example` to `.env`, edit it, and run `docker compose up -d` again.

### HTTPS on your own domain

`docker-compose.https.yml` puts [Caddy](https://caddyserver.com) in front of the server. Caddy gets and renews a certificate automatically.

1. Point your domain's DNS at the machine and open ports 80 and 443.
2. Set `DOMAIN=your.domain` in `.env`.
3. Run:

   ```sh
   docker compose -f docker-compose.https.yml up -d
   ```

This setup sets `TRUST_PROXY=true` so cooldowns use the player's address rather than Caddy's. It also doesn't publish the server's own port, so the forwarded header can't be faked by connecting around the proxy.

## Running from source

Requires Node.js 24 or newer (see `.nvmrc`).

```sh
npm run setup   # install server and client dependencies
npm run build   # build the client into client/dist
npm start       # start the server on http://localhost:8080
```

The server serves `client/dist` automatically if it exists. When run from source, the canvas is stored in `server/data/`.

## Configuration

The server is configured with environment variables:

| Variable                 | Default                           | Description |
| ------------------------ | --------------------------------- | ----------- |
| `PORT`                   | `8080`                            | Port to listen on. |
| `HOST`                   | all interfaces                    | Address to bind to, e.g. `127.0.0.1`. |
| `WIDTH`, `HEIGHT`        | `1000`                            | Canvas size in pixels (max 4096). You can grow the canvas later. The server refuses to start with a size that would cut off existing pixels. |
| `COOLDOWN_SECONDS`       | `60`                              | How long each IP address waits between pixels. `0` disables the cooldown. |
| `DATA_DIR`               | `./data` (`/data` in Docker)      | Where the SQLite database is stored. Must be writable by the server. |
| `CLIENT_DIR`             | `../client/dist`, if it exists    | Website to serve. Set to an empty value to serve only the WebSocket endpoint. |
| `TRUST_PROXY`            | `false`                           | Use the last `X-Forwarded-For` entry as the client address. **Required behind any reverse proxy** (nginx, Traefik, a load balancer): without it every player appears to come from the proxy's address and they all share one cooldown and one connection limit. Never enable it when the server is reachable directly, because then players can fake the header. |
| `MAX_CONNECTIONS_PER_IP` | `10`                              | Open connections allowed per address. |

Cooldowns are tracked per IPv4 address and per IPv6 /64 network. They are kept in memory, so a server restart resets them.

**Docker bind mounts.** The container runs as the `node` user (uid 1000). The named volume in `docker-compose.yml` sets this up for you. If you mount a host directory instead, make it writable first, for example with `sudo chown 1000:1000 ./data`.

**Backups.** Everything is in `pixelplace.db` in the data directory. Copy it while the server is stopped, or use `sqlite3 pixelplace.db ".backup backup.db"` while it runs. Deleting the database (or the Docker volume) resets the canvas.

### Hosting the client somewhere else

The client in `client/dist` is a static site. You can host it anywhere: GitHub Pages, Netlify, an S3 bucket, nginx.

- **Which server it connects to.** On startup the client reads `config.json` from next to `index.html`:
  - `{"defaultServer": null}` (the default) shows a screen where players type a server address.
  - `{"defaultServer": "place.example.com"}` connects there straight away.

  You can edit this file after building. Links with `?server=…` always win. A PixelPlace server answers `/config.json` itself with `{"defaultServer": "/"}` ("this server"), which is why the copy it serves connects to itself.
- **Sub-paths.** If the site doesn't live at the root of its domain, build it with the matching base path:

  ```sh
  npm run build --prefix client -- --base-href /PixelPlace/
  ```
- **HTTPS.** Browsers only let pages served over HTTPS open secure WebSockets (`wss://`). A client on an HTTPS host can therefore only connect to servers behind HTTPS, such as the Caddy setup above. `localhost` is the exception.

Servers accept connections from clients hosted anywhere. There are no logins or cookies to protect.

## Playing

| Action                     | Mouse / keyboard                              | Touch |
| -------------------------- | --------------------------------------------- | ----- |
| Pan                        | Drag, or arrow keys / WASD                    | Drag |
| Zoom                       | Scroll wheel or trackpad pinch, `+` / `-`     | Pinch |
| Place a pixel              | Pick a colour, then click a pixel             | Pick a colour, tap a pixel to aim, then press **Place** |
| Zoom in to place           | When zoomed out, the first click zooms in     | When zoomed out, the first tap zooms in |
| See who placed a pixel     | With no colour selected, click a pixel        | With no colour selected, tap a pixel |
| Cancel                     | `Esc` (or click the selected colour again)    | Tap the selected colour again |

The address bar always holds a link to the current view, so you can copy it to share a spot on the canvas.

## Development

```sh
npm run setup
npm run dev        # server on :8080 (restarts on change) + client on http://localhost:4200
npm run typecheck  # server type check (the client build type-checks itself)
```

The Angular dev server proxies `/ws` and `/config.json` to the server on port 8080 (see `client/proxy.conf.json`), so the app on port 4200 connects to your local server automatically.

```
server/   Node.js server: HTTP, WebSocket, game rules, SQLite storage. Runs TypeScript directly.
client/   Angular app: canvas engine (camera, renderer, input), connection, UI.
shared/   protocol.ts, the wire protocol, used by both.
```

The server runs its TypeScript sources directly with Node's built-in type stripping, so it has no build step. Its only dependency is [`ws`](https://github.com/websockets/ws).

### Protocol

Everything goes over one WebSocket at `/ws`. `shared/protocol.ts` has the exact types.

- On connect, the server sends a JSON `hello` with:
  - the canvas size and palette
  - the cooldown, and how much of it this address still has to wait
  - the online count

  Then it sends a binary **snapshot** frame: `[1][width u16][height u16][gzip of width×height palette indices]`.
- Changes arrive as binary **pixels** frames, batched every 50 ms: `[2]` followed by `[x u16][y u16][colour u8]` per pixel.
- The client sends JSON:
  - `{"type":"place","x":…,"y":…,"color":…,"nickname":"…"}`, answered by a `placeResult` with the pixel's resulting colour and the cooldown.
  - `{"type":"info","x":…,"y":…}`, answered by `pixelInfo` (colour, nickname, time).
- The server also sends `online` count updates and `error` messages.

Integers are big-endian. Messages over 1 KB or arriving faster than a generous rate limit close the connection.

The database keeps a history of every placement alongside the current canvas. To tell repeat players apart without storing addresses, the history records a keyed hash of the player's address instead of the address itself.
