import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { IconComponent } from '../../shared/components/icon/icon';

/**
 * Bottom navigation for signed-in users on phones — the thumb zone.
 * "New" opens the create-habit dialog through `/dashboard?create=1`.
 *
 * While rendered it puts `.has-tab-bar` on <html>; styles.css turns that into
 * `--tab-bar-h`, which pages and toasts use to stay clear of the bar.
 */
@Component({
  selector: 'sh-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    @if (auth.isAuthenticated()) {
      <nav class="bar" aria-label="Quick navigation">
        <a class="tab" routerLink="/" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">
          <sh-icon name="mountain" /><span>Summit</span>
        </a>
        <a class="tab" routerLink="/dashboard" routerLinkActive="is-active">
          <sh-icon name="grid" /><span>Habits</span>
        </a>
        <a class="tab tab--new" routerLink="/dashboard" [queryParams]="{ create: 1 }" aria-label="New habit">
          <span class="tab__plus"><sh-icon name="plus" /></span>
        </a>
        <a class="tab" routerLink="/profile" routerLinkActive="is-active">
          <sh-icon name="user" /><span>Profile</span>
        </a>
        <button type="button" class="tab" (click)="theme.toggle()" [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'">
          <sh-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" /><span>Theme</span>
        </button>
      </nav>
    }
  `,
  styles: `
    :host {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: var(--z-dock);
      display: none;
      pointer-events: none;
    }

    @media (max-width: 767px) {
      :host { display: block; }
    }

    .bar {
      pointer-events: auto;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      align-items: center;
      margin: 0 0.6rem max(0.6rem, env(safe-area-inset-bottom));
      height: 64px;
      padding: 0 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 22px;
      background: color-mix(in srgb, var(--surface-solid) 86%, transparent);
      -webkit-backdrop-filter: blur(16px) saturate(1.3);
      backdrop-filter: blur(16px) saturate(1.3);
      box-shadow: var(--shadow-deep);
    }

    .tab {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0.2rem;
      height: 100%;
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text-muted);
      font-size: 0.66rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
      transition: color 200ms ease;
    }

    .tab sh-icon { width: 22px; height: 22px; transition: transform 200ms var(--ease-out); }
    .tab:active sh-icon { transform: scale(0.88); }

    .tab.is-active { color: var(--ember-soft); }
    .tab.is-active sh-icon { color: var(--ember); filter: drop-shadow(0 0 6px rgba(var(--ember-rgb), 0.6)); }

    .tab__plus {
      display: grid;
      place-items: center;
      width: 50px;
      height: 50px;
      border-radius: 18px;
      background: linear-gradient(180deg, var(--ember) 0%, var(--ember-strong) 100%);
      color: #fff;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), var(--glow-md);
    }

    .tab--new:active .tab__plus { transform: scale(0.94); }
    .tab__plus sh-icon { width: 26px; height: 26px; }
  `,
})
export class TabBarComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  constructor() {
    const root = document.documentElement;
    effect(() => root.classList.toggle('has-tab-bar', this.auth.isAuthenticated()));
    inject(DestroyRef).onDestroy(() => root.classList.remove('has-tab-bar'));
  }
}
