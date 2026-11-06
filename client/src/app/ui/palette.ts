import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { Point } from '../engine/camera';
import { colorName, formatCountdown } from './format';

/** Colour picker with the cooldown countdown and, on touch screens, the "Place" button. */
@Component({
  selector: 'pp-palette',
  host: { class: 'panel palette' },
  template: `
    <div class="palette__status" aria-live="polite">
      @if (remaining() > 0) {
        <span
          >Next pixel in <strong class="palette__countdown">{{ countdown() }}</strong></span
        >
      } @else if (selected() === null) {
        <span>Pick a colour · {{ touch() ? 'tap' : 'click' }} a pixel to see who placed it</span>
      } @else if (target(); as t) {
        <button type="button" class="button button--primary" (click)="confirm.emit()">
          Place at ({{ t.x }}, {{ t.y }})
        </button>
      } @else if (zoomedOut()) {
        <span
          >{{ touch() ? 'Tap' : 'Click' }} the canvas to zoom in, then
          {{ touch() ? 'tap' : 'click' }} a pixel</span
        >
      } @else {
        <span
          >{{ touch() ? 'Tap a pixel to aim' : 'Click a pixel to place it' }} · Esc to cancel</span
        >
      }
    </div>
    @if (remaining() > 0) {
      <div class="palette__progress" aria-hidden="true">
        <div class="palette__progress-bar" [style.transform]="'scaleX(' + progress() + ')'"></div>
      </div>
    }
    <div class="palette__swatches" role="radiogroup" aria-label="Colour">
      @for (color of colors(); track $index) {
        <button
          type="button"
          role="radio"
          class="swatch"
          [class.swatch--selected]="selected() === $index"
          [attr.aria-checked]="selected() === $index"
          [attr.aria-label]="name(color)"
          [title]="name(color) + (selected() === $index ? ' (click again to deselect)' : '')"
          [style.background-color]="color"
          (click)="select.emit(selected() === $index ? null : $index)"
        ></button>
      }
    </div>
  `,
})
export class Palette {
  readonly colors = input.required<readonly string[]>();
  readonly selected = input<number | null>(null);
  /** Date.now() time when placing is allowed again. */
  readonly cooldownEndsAt = input(0);
  readonly cooldownMs = input(0);
  /** Pixel waiting for confirmation (touch input). */
  readonly target = input<Point | null>(null);
  readonly touch = input(false);
  /** Too far out to place: the first click zooms in. */
  readonly zoomedOut = input(false);

  readonly select = output<number | null>();
  readonly confirm = output<void>();

  readonly #now = signal(Date.now());
  protected readonly remaining = computed(() => Math.max(0, this.cooldownEndsAt() - this.#now()));
  protected readonly countdown = computed(() => formatCountdown(this.remaining()));
  protected readonly progress = computed(() => {
    const total = this.cooldownMs();
    return total > 0 ? 1 - this.remaining() / total : 1;
  });
  protected readonly name = colorName;

  constructor() {
    // Tick only while a cooldown is running.
    effect((onCleanup) => {
      const end = this.cooldownEndsAt();
      untracked(() => this.#now.set(Date.now()));
      if (end <= Date.now()) return;
      const timer = setInterval(() => {
        const now = Date.now();
        this.#now.set(now);
        if (now >= end) clearInterval(timer);
      }, 250);
      onCleanup(() => clearInterval(timer));
    });
  }
}
