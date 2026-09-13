import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SummitArtComponent } from '../../shared/components/summit-art/summit-art';

/** Two-column frame for sign in / sign up: the summit on the left, the form on the right */
@Component({
  selector: 'sh-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SummitArtComponent],
  template: `
    <div class="shell container page">
      <aside class="side" aria-hidden="true">
        <sh-summit-art class="side__art" [framed]="true" [eager]="true" focus="62% 45%" />
        <div class="side__copy">
          <p class="eyebrow">{{ eyebrow() }}</p>
          <p class="side__quote">{{ quote() }}</p>
        </div>
      </aside>

      <section class="panel card">
        <header class="card__head">
          <h1>{{ heading() }}</h1>
          <p class="muted">{{ subheading() }}</p>
        </header>
        <ng-content />
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }

    .shell {
      display: grid;
      gap: 1.5rem;
      align-items: stretch;
      max-width: 1080px;
    }

    .side { display: none; }

    .card {
      display: grid;
      gap: 1.5rem;
      width: 100%;
      max-width: 460px;
      margin-inline: auto;
      padding: clamp(1.25rem, 1rem + 2vw, 2.25rem);
    }

    .card__head h1 {
      margin: 0;
      font-size: var(--fs-h1);
      letter-spacing: -0.03em;
    }

    .card__head p { margin: 0.4rem 0 0; }

    @media (min-width: 900px) {
      .shell { grid-template-columns: 1.05fr 1fr; gap: 2rem; }

      .side {
        position: relative;
        display: grid;
        align-items: end;
        min-height: 620px;
      }

      .side__art { position: absolute; inset: 0; }

      .side__copy {
        position: relative;
        display: grid;
        gap: 0.75rem;
        padding: 2rem;
      }

      .side__quote {
        margin: 0;
        max-width: 22ch;
        font-family: var(--font-display);
        font-size: var(--fs-h2);
        line-height: 1.15;
        color: #fff;
      }

      .card { align-self: center; max-width: none; }
    }
  `,
})
export class AuthShellComponent {
  readonly heading = input.required<string>();
  readonly subheading = input('');
  readonly eyebrow = input('SyncHabit');
  readonly quote = input('');
}
