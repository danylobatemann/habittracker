import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../shared/components/button/button';
import { IconComponent } from '../../shared/components/icon/icon';
import { SummitArtComponent } from '../../shared/components/summit-art/summit-art';

@Component({
  selector: 'sh-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent, IconComponent, SummitArtComponent],
  template: `
    <div class="page container">
      <section class="panel lost">
        <sh-summit-art class="art" [eager]="true" focus="55% 45%" />
        <div class="content">
          <p class="code mono" aria-hidden="true">404</p>
          <h1>Lost on the mountain</h1>
          <p class="muted">This trail doesn’t lead anywhere. The link may be mistyped, or the page moved to another ridge.</p>
          <a shButton size="lg" [routerLink]="auth.isAuthenticated() ? '/dashboard' : '/'">
            <sh-icon name="mountain" /> Back to basecamp
          </a>
        </div>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }

    .page { display: grid; place-items: center; min-height: calc(100dvh - var(--page-top) - 2rem); }

    .lost {
      position: relative;
      display: grid;
      width: min(100%, 760px);
      min-height: 420px;
      overflow: hidden;
      border-radius: var(--radius-panel);
    }

    .art { position: absolute; inset: 0; opacity: 0.6; }

    .content {
      position: relative;
      display: grid;
      align-content: end;
      justify-items: start;
      gap: 0.8rem;
      padding: clamp(1.25rem, 1rem + 2vw, 2.5rem);
      background: linear-gradient(0deg, rgba(4, 5, 8, 0.9), transparent 75%);
    }

    .code {
      margin: 0;
      font-size: clamp(3.5rem, 2rem + 8vw, 7rem);
      font-weight: 800;
      line-height: 0.9;
      color: transparent;
      -webkit-text-stroke: 1.5px rgba(var(--ember-rgb), 0.85);
      text-shadow: 0 0 40px rgba(var(--ember-rgb), 0.35);
    }

    h1 { margin: 0; font-size: var(--fs-h1); letter-spacing: -0.03em; color: #f5f2ed; }
    p { margin: 0 0 0.6rem; max-width: 46ch; color: #b9b5ae; }
  `,
})
export class NotFoundPage {
  protected readonly auth = inject(AuthService);
}
