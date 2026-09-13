import { ChangeDetectionStrategy, Component, ViewEncapsulation, booleanAttribute, input } from '@angular/core';

export type ButtonVariant = 'spin' | 'solid' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button with the "spinning border" look (port of SpinningBorderButton):
 * a conic gradient rotates behind a dark pill, leaving a 1.5 px neon rim.
 * The angle is an animatable registered custom property (`@property --sh-angle`),
 * so it's pure CSS — no JS, no extra DOM per frame.
 *
 *   <button shButton (click)="save()">Save</button>
 *   <a shButton variant="ghost" routerLink="/login">Sign in</a>
 *   <button shButton variant="solid" size="lg" block [busy]="saving()">…</button>
 */
@Component({
  selector: 'button[shButton], a[shButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Styles must reach the host element and projected icons
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'sh-btn',
    '[class.sh-btn--spin]': 'variant() === "spin"',
    '[class.sh-btn--solid]': 'variant() === "solid"',
    '[class.sh-btn--ghost]': 'variant() === "ghost"',
    '[class.sh-btn--danger]': 'variant() === "danger"',
    '[class.sh-btn--sm]': 'size() === "sm"',
    '[class.sh-btn--lg]': 'size() === "lg"',
    '[class.sh-btn--block]': 'block()',
    '[class.sh-btn--icon]': 'iconOnly()',
    '[class.is-busy]': 'busy()',
    '[attr.aria-busy]': 'busy() || null',
  },
  template: `
    <span class="sh-btn__inner">
      @if (busy()) {
        <span class="sh-btn__spinner" aria-hidden="true"></span>
      }
      <ng-content />
    </span>
  `,
  styles: `
    @property --sh-angle {
      syntax: '<angle>';
      initial-value: 0deg;
      inherits: false;
    }

    .sh-btn {
      --btn-h: 50px;
      --btn-px: 1.4rem;
      --btn-rim: 1.5px;
      --btn-fill: var(--surface-solid);

      position: relative;
      isolation: isolate;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: var(--btn-h);
      padding: 0;
      border: 0;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--heading);
      font-family: var(--font-body);
      font-size: 0.975rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: transform 180ms var(--ease-out), filter 200ms ease, opacity 200ms ease;
    }

    .sh-btn:hover { color: var(--heading); }
    .sh-btn:active:not(:disabled) { transform: scale(0.97); }

    .sh-btn__inner {
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      width: 100%;
      min-height: inherit;
      padding: 0 var(--btn-px);
      border-radius: inherit;
    }

    .sh-btn sh-icon { width: 1.2em; height: 1.2em; }

    /* --- spin: rotating conic rim + blurred glow copy ------------------------ */
    .sh-btn--spin::before,
    .sh-btn--spin::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      background: conic-gradient(
        from var(--sh-angle),
        transparent 0deg,
        rgba(var(--ember-rgb), 0.15) 70deg,
        var(--ember) 140deg,
        var(--gold) 170deg,
        rgba(var(--ember-rgb), 0.15) 220deg,
        transparent 280deg,
        rgba(var(--ink-rgb), 0.35) 330deg,
        transparent 360deg
      );
      animation: sh-btn-spin 3.2s linear infinite;
    }

    .sh-btn--spin::after {
      inset: 4px;
      filter: blur(14px);
      opacity: 0.45;
      transition: opacity 250ms ease;
    }

    .sh-btn--spin .sh-btn__inner {
      margin: var(--btn-rim);
      min-height: calc(var(--btn-h) - var(--btn-rim) * 2);
      padding-inline: calc(var(--btn-px) - var(--btn-rim));
      background:
        radial-gradient(120% 140% at 50% -20%, rgba(var(--ember-rgb), 0.16), transparent 60%),
        var(--btn-fill);
      box-shadow: inset 0 1px 0 rgba(var(--ink-rgb), 0.06);
    }

    .sh-btn--spin:hover::before,
    .sh-btn--spin:focus-visible::before { animation-duration: 1.6s; }
    .sh-btn--spin:hover::after { opacity: 0.8; }

    @keyframes sh-btn-spin {
      to { --sh-angle: 360deg; }
    }

    /* --- solid ------------------------------------------------------------------- */
    .sh-btn--solid .sh-btn__inner {
      background: linear-gradient(180deg, var(--ember) 0%, var(--ember-strong) 100%);
      color: #fff;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), var(--glow-md);
    }

    .sh-btn--solid { color: #fff; }
    .sh-btn--solid:hover { color: #fff; filter: brightness(1.08); }

    /* --- ghost ------------------------------------------------------------------- */
    .sh-btn--ghost .sh-btn__inner {
      border: 1px solid var(--line-strong);
      background: rgba(var(--ink-rgb), 0.03);
      color: var(--text);
      transition: border-color 200ms ease, background-color 200ms ease, color 200ms ease;
    }

    .sh-btn--ghost:hover .sh-btn__inner {
      border-color: rgba(var(--ember-rgb), 0.6);
      background: rgba(var(--ember-rgb), 0.08);
      color: var(--heading);
    }

    /* --- danger ------------------------------------------------------------------ */
    .sh-btn--danger .sh-btn__inner {
      border: 1px solid rgba(255, 83, 100, 0.45);
      background: rgba(255, 83, 100, 0.08);
      color: var(--danger);
    }

    .sh-btn--danger:hover .sh-btn__inner { background: rgba(255, 83, 100, 0.16); }

    /* --- sizes & modifiers ---------------------------------------------------------- */
    .sh-btn--sm { --btn-h: 40px; --btn-px: 1rem; font-size: 0.875rem; }
    .sh-btn--lg { --btn-h: 58px; --btn-px: 1.9rem; font-size: 1.05rem; }
    .sh-btn--block { display: flex; width: 100%; }
    .sh-btn--icon { --btn-px: 0; width: var(--btn-h); }

    .sh-btn:disabled,
    .sh-btn[aria-disabled='true'] {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .sh-btn:disabled::before,
    .sh-btn:disabled::after { animation-play-state: paused; }

    .sh-btn.is-busy { cursor: progress; opacity: 1; }

    .sh-btn__spinner {
      width: 1em;
      height: 1em;
      border-radius: 50%;
      border: 2px solid currentColor;
      border-right-color: transparent;
      animation: sh-btn-rotate 700ms linear infinite;
    }

    @keyframes sh-btn-rotate {
      to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sh-btn--spin::before,
      .sh-btn--spin::after { animation: none; --sh-angle: 120deg; }
    }
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('spin');
  readonly size = input<ButtonSize>('md');
  readonly block = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly iconOnly = input(false, { transform: booleanAttribute });
}
