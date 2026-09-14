import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { refreshScrollTriggers } from './core/animations/gsap';
import { routeTransition } from './core/animations/route-animations';
import { ThemeService } from './core/services/theme.service';
import { ClockSync } from './core/time/clock-sync.service';
import { FloatingDockComponent } from './layout/floating-dock/floating-dock';
import { KineticGridComponent } from './layout/kinetic-grid/kinetic-grid';
import { SmoothCursorComponent } from './layout/smooth-cursor/smooth-cursor';
import { TabBarComponent } from './layout/tab-bar/tab-bar';
import { ToastOutletComponent } from './layout/toast-outlet/toast-outlet';

/**
 * Shell: kinetic grid (background) → dock → routed page → tab bar (phones) → toasts → smooth cursor (on top).
 *
 * `routeKey` is the path without query/fragment and drives @routeTransition,
 * so changing only query params (e.g. ?returnUrl) doesn't replay the animation.
 */
@Component({
  selector: 'sh-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, KineticGridComponent, FloatingDockComponent, TabBarComponent, ToastOutletComponent, SmoothCursorComponent],
  animations: [routeTransition],
  template: `
    <a class="skip-link" href="#content" (click)="skipToContent($event)">Skip to content</a>

    <sh-kinetic-grid />
    <sh-floating-dock />

    <main id="content" #main class="main" tabindex="-1" [@routeTransition]="routeKey()">
      <router-outlet />
    </main>

    <sh-tab-bar />
    <sh-toast-outlet />
    <sh-smooth-cursor />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .main {
      position: relative;
      z-index: var(--z-content);
      display: block;
      flex: 1;
      outline: none;
    }
  `,
})
export class App {
  private readonly router = inject(Router);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly routeKey = signal('/');

  constructor() {
    inject(ThemeService); // applies & persists the theme from the first frame
    inject(ClockSync).start(inject(DestroyRef));

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.routeKey.set(event.urlAfterRedirects.split(/[?#]/)[0] || '/');
        // New page heights are only known after render + enter animation
        setTimeout(refreshScrollTriggers, 560);
      });
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    const main = this.main().nativeElement;
    main.focus();
    main.scrollIntoView();
  }
}
