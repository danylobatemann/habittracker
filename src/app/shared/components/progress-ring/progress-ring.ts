import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Circular progress. Two arcs share the ring:
 *   • `value` (0–1) — progress, ember with a glow;
 *   • `cooldown` (0–1) — a thin ice arc that drains while the habit cools down.
 * Content is projected into the centre.
 */
@Component({
  selector: 'sh-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--ring-size.px]': 'size()',
    '[class.is-complete]': 'value() >= 1',
    role: 'img',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  template: `
    <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" aria-hidden="true">
      <circle class="track" [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" [attr.stroke-width]="stroke()" />
      <circle
        class="value"
        [attr.cx]="c()"
        [attr.cy]="c()"
        [attr.r]="r()"
        [attr.stroke-width]="stroke()"
        [attr.stroke-dasharray]="circumference()"
        [attr.stroke-dashoffset]="valueOffset()"
      />
      @if (cooldown() > 0) {
        <circle
          class="cooldown"
          [attr.cx]="c()"
          [attr.cy]="c()"
          [attr.r]="r() - stroke() - 3"
          [attr.stroke-dasharray]="innerCircumference()"
          [attr.stroke-dashoffset]="cooldownOffset()"
        />
      }
    </svg>
    <div class="center"><ng-content /></div>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: var(--ring-size);
      height: var(--ring-size);
      flex-shrink: 0;
    }

    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
      overflow: visible;
    }

    circle { fill: none; }

    .track { stroke: rgba(var(--ink-rgb), 0.08); }

    .value {
      stroke: var(--ember);
      stroke-linecap: round;
      filter: drop-shadow(0 0 6px rgba(var(--ember-rgb), 0.65));
      transition: stroke-dashoffset 700ms var(--ease-out), stroke 300ms ease;
    }

    :host(.is-complete) .value { stroke: var(--gold); }

    .cooldown {
      stroke: var(--ice);
      stroke-width: 2;
      stroke-linecap: round;
      opacity: 0.7;
    }

    .center {
      position: relative;
      display: grid;
      place-items: center;
      text-align: center;
    }
  `,
})
export class ProgressRingComponent {
  readonly value = input(0);
  readonly cooldown = input(0);
  readonly size = input(96);
  readonly stroke = input(7);
  readonly label = input('');

  protected readonly c = computed(() => this.size() / 2);
  protected readonly r = computed(() => this.size() / 2 - this.stroke() / 2 - 1);
  protected readonly circumference = computed(() => 2 * Math.PI * this.r());
  protected readonly innerCircumference = computed(() => 2 * Math.PI * (this.r() - this.stroke() - 3));
  protected readonly valueOffset = computed(() => this.circumference() * (1 - clamp(this.value())));
  protected readonly cooldownOffset = computed(() => this.innerCircumference() * (1 - clamp(this.cooldown())));
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v || 0));
}
