import { Component, computed, input, output } from '@angular/core';
import type { PixelInfoMessage } from '@shared/protocol';
import type { Point } from '../engine/camera';
import { colorName, formatRelativeTime } from './format';

/** Who placed the inspected pixel, and when. */
@Component({
  selector: 'pp-pixel-info',
  host: { class: 'panel pixel-info', role: 'dialog', 'aria-label': 'Pixel details' },
  template: `
    <div class="pixel-info__head">
      @if (info(); as i) {
        <span
          class="pixel-info__swatch"
          [style.background-color]="palette()[i.color]"
          [title]="colorName(palette()[i.color] ?? '')"
        ></span>
      }
      <strong>({{ pixel().x }}, {{ pixel().y }})</strong>
      <button
        type="button"
        class="icon-button"
        aria-label="Close pixel details"
        (click)="close.emit()"
      >
        ×
      </button>
    </div>
    @if (info(); as i) {
      @if (i.placedAt === null) {
        <p class="muted">Nobody has placed this pixel yet.</p>
      } @else {
        <p>
          Placed by
          @if (i.nickname) {
            <strong class="pixel-info__name">{{ i.nickname }}</strong>
          } @else {
            <em>anonymous</em>
          }
        </p>
        <p class="muted">
          <time [attr.datetime]="placedAtIso()" [title]="placedAtLocal()">{{
            placedAtRelative()
          }}</time>
        </p>
      }
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class PixelInfo {
  readonly pixel = input.required<Point>();
  readonly info = input<PixelInfoMessage | null>(null);
  readonly palette = input<readonly string[]>([]);
  readonly close = output<void>();

  protected readonly colorName = colorName;
  readonly #placedAt = computed(() => this.info()?.placedAt ?? null);
  protected readonly placedAtIso = computed(() => {
    const at = this.#placedAt();
    return at === null ? null : new Date(at).toISOString();
  });
  protected readonly placedAtLocal = computed(() => {
    const at = this.#placedAt();
    return at === null ? '' : new Date(at).toLocaleString();
  });
  protected readonly placedAtRelative = computed(() => {
    const at = this.#placedAt();
    return at === null ? '' : formatRelativeTime(at);
  });
}
