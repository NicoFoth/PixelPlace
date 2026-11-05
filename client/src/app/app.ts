import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { resolveServer, type ServerAddress } from './net/server-address';
import { loadRuntimeConfig } from './state/runtime-config';
import { Session } from './state/session';
import { Settings } from './state/settings';
import { formatUrlSearch, readUrlState, type UrlView } from './state/url-state';
import { ConnectScreen } from './ui/connect-screen';
import { PlaceView } from './ui/place-view';

/** Picks a server (from the link, the deployment config or the user) and shows its canvas. */
@Component({
  selector: 'app-root',
  imports: [ConnectScreen, PlaceView],
  template: `
    @if (showConnect()) {
      <pp-connect-screen
        [initialAddress]="connectAddress()"
        [error]="connectError()"
        [defaultServer]="defaultServer()"
        (connectTo)="connect($event, null)"
      />
    } @else {
      <!-- Keyed on the session so switching servers gets a fresh view. -->
      @for (s of sessions(); track s) {
        <pp-place-view [session]="s" (leave)="leave()" />
      }
    }
  `,
})
export class App {
  readonly #settings = inject(Settings);
  readonly #title = inject(Title);

  protected readonly session = signal<Session | null>(null);
  protected readonly sessions = computed(() => {
    const session = this.session();
    return session ? [session] : [];
  });
  protected readonly showConnect = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly defaultServer = signal<string | null>(null);
  /** What the address field shows: a rejected address, else the last server used. */
  readonly #pendingAddress = signal<string | null>(null);
  protected readonly connectAddress = computed(
    () => this.#pendingAddress() ?? this.#settings.recentServers()[0] ?? '',
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.session()?.dispose());
    void this.#start();
  }

  async #start(): Promise<void> {
    const url = readUrlState(location.search);
    if (url.server) {
      this.connect(url.server, url.view);
      return;
    }
    const config = await loadRuntimeConfig();
    this.defaultServer.set(config.defaultServer);
    if (config.defaultServer) this.connect(config.defaultServer, url.view);
    else this.#showConnectScreen(null);
  }

  protected connect(input: string, view: UrlView | null): void {
    let address: ServerAddress;
    try {
      address = resolveServer(input, { protocol: location.protocol, baseUrl: document.baseURI });
    } catch (error) {
      this.#pendingAddress.set(input);
      this.#showConnectScreen(error instanceof Error ? error.message : String(error));
      return;
    }
    this.session()?.dispose();
    if (address.param) this.#settings.rememberServer(address.param);
    this.#replaceSearch(formatUrlSearch({ server: address.param, view }, location.search));
    this.#pendingAddress.set(null);
    this.connectError.set(null);
    this.showConnect.set(false);
    this.session.set(new Session(address, { initialView: view }));
  }

  protected leave(): void {
    this.session()?.dispose();
    this.session.set(null);
    this.#replaceSearch(formatUrlSearch({ server: null, view: null }, location.search));
    this.#showConnectScreen(null);
  }

  #showConnectScreen(error: string | null): void {
    this.connectError.set(error);
    this.showConnect.set(true);
    this.#title.setTitle('PixelPlace');
  }

  #replaceSearch(search: string): void {
    history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
  }
}
