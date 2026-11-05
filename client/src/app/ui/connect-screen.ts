import { Component, inject, input, output } from '@angular/core';
import { Settings } from '../state/settings';

/** Shown when no server is chosen yet: enter an address or pick a recent one. */
@Component({
  selector: 'pp-connect-screen',
  host: { class: 'connect' },
  template: `
    <form class="panel connect__card" (submit)="submit($event, address.value)">
      <img class="connect__logo" src="icon.png" alt="" width="72" height="72" />
      <h1>PixelPlace</h1>
      <p class="muted">
        A shared canvas. Pick a colour, place a pixel, wait for your cooldown, repeat.
      </p>

      <label class="connect__label" for="server-address">Server address</label>
      <div class="connect__row">
        <input
          #address
          id="server-address"
          name="server"
          class="input"
          [value]="initialAddress()"
          placeholder="example.com or localhost:8080"
          autocomplete="url"
          autocapitalize="off"
          spellcheck="false"
          required
        />
        <button type="submit" class="button button--primary">Connect</button>
      </div>
      @if (error(); as message) {
        <p class="connect__error" role="alert">{{ message }}</p>
      }

      @if (defaultServer() || settings.recentServers().length) {
        <h2 class="connect__heading">Servers</h2>
        <ul class="connect__list">
          @if (defaultServer(); as server) {
            <li>
              <button type="button" class="connect__server" (click)="connectTo.emit(server)">
                This site's server
              </button>
            </li>
          }
          @for (server of settings.recentServers(); track server) {
            <li>
              <button type="button" class="connect__server" (click)="connectTo.emit(server)">
                {{ server }}
              </button>
              <button
                type="button"
                class="icon-button"
                [attr.aria-label]="'Forget ' + server"
                title="Forget"
                (click)="settings.forgetServer(server)"
              >
                ×
              </button>
            </li>
          }
        </ul>
      }

      <p class="connect__footer muted">
        Anyone can host a PixelPlace server. No accounts: your nickname and recent servers are only
        stored in this browser.
      </p>
    </form>
  `,
})
export class ConnectScreen {
  readonly initialAddress = input('');
  readonly error = input<string | null>(null);
  /** The deployment's own server (from config.json), if it has one. */
  readonly defaultServer = input<string | null>(null);
  readonly connectTo = output<string>();

  protected readonly settings = inject(Settings);

  protected submit(event: Event, address: string): void {
    event.preventDefault();
    this.connectTo.emit(address);
  }
}
