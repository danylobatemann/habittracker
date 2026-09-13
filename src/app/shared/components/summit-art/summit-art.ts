import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

const PHOTO = 'images/mountain.jpg';
const FALLBACK = 'images/mountain.svg';

/**
 * The night-summit picture. Uses the photo from `public/images/mountain.jpg`
 * and falls back to the bundled illustration when the photo isn't there.
 * Sits in a masked frame so it blends into the page ground.
 */
@Component({
  selector: 'sh-summit-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-framed]': 'framed()',
    '[style.--focus]': 'focus()',
  },
  template: `
    <img
      class="art"
      [src]="src()"
      alt=""
      decoding="async"
      [attr.fetchpriority]="eager() ? 'high' : null"
      [attr.loading]="eager() ? 'eager' : 'lazy'"
      (error)="useFallback()"
    />
    <span class="peak-glow" aria-hidden="true"></span>
    <span class="fade" aria-hidden="true"></span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      background: #050608;
    }

    .art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      object-fit: cover;
      object-position: var(--focus, 60% 70%);
      will-change: transform;
    }

    /* Warm pulse around the sunlit summit */
    .peak-glow {
      position: absolute;
      left: 62%;
      top: 26%;
      width: 42%;
      aspect-ratio: 1;
      translate: -50% -50%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(var(--ember-rgb), 0.22), transparent 62%);
      animation: peak-breathe 6s ease-in-out infinite;
      pointer-events: none;
    }

    .fade {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(3, 4, 6, 0.55) 0%, transparent 28%, transparent 62%, var(--bg) 100%),
        linear-gradient(90deg, rgba(3, 4, 6, 0.6) 0%, transparent 55%);
      pointer-events: none;
    }

    :host(.is-framed) {
      border: 1px solid var(--line);
      border-radius: var(--radius-panel);
      box-shadow: var(--shadow-deep);
    }

    :host(.is-framed) .fade {
      background: linear-gradient(180deg, transparent 45%, rgba(3, 4, 6, 0.85) 100%);
    }

    @keyframes peak-breathe {
      0%, 100% { opacity: 0.7; scale: 1; }
      50% { opacity: 1; scale: 1.08; }
    }

    @media (prefers-reduced-motion: reduce) {
      .peak-glow { animation: none; }
    }
  `,
})
export class SummitArtComponent {
  readonly framed = input(false);
  readonly eager = input(false);
  /** object-position of the picture */
  readonly focus = input('60% 70%');

  protected readonly src = signal(PHOTO);

  protected useFallback(): void {
    if (this.src() !== FALLBACK) this.src.set(FALLBACK);
  }
}
