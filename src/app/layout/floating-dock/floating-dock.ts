import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { prefersReducedMotion } from '../../core/animations/gsap';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';

interface DockItem {
  id: string;
  label: string;
  icon: IconName;
  link?: string;
  action?: () => void;
}

const BASE = 42;
const MAX = 62;
const RANGE = 140;
const SPRING = 0.22;

/**
 * Top panel — Angular port of the Aceternity "Floating Dock" (dock.txt).
 *
 * Desktop: a glass pill pinned to the top; icons magnify toward the pointer
 * (macOS-dock style) and neighbours make room. The original uses
 * framer-motion springs; here a single rAF loop eases every item's size and
 * sleeps once they settle.
 *
 * Mobile: brand + level on the left, a menu button that unfolds the same items
 * as a staggered vertical list. Closes on navigation, Escape and outside tap.
 */
@Component({
  selector: 'sh-floating-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent, AvatarComponent],
  host: {
    '[class.is-scrolled]': 'scrolled()',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <nav class="bar" aria-label="Main">
      <a class="brand" routerLink="/" aria-label="SyncHabit home">
        <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M3 26 13 9l5 8 3-4 8 13Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
          <path d="m13 9 2.6 4.2L13 15l-2.4-2Z" fill="var(--ember)" />
          <circle cx="24" cy="6" r="2" fill="var(--gold)" />
        </svg>
        <span class="brand__name">Sync<span>Habit</span></span>
      </a>

      <!-- Desktop dock -->
      <ul class="dock" #dock (pointerleave)="release()" (pointermove)="track($event)">
        @for (item of items(); track item.id) {
          <li class="dock__slot">
            @if (item.link) {
              <a
                class="dock__item"
                [routerLink]="item.link"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: item.link === '/' }"
                [attr.aria-label]="item.label"
              >
                <sh-icon [name]="item.icon" />
                <span class="dock__tip" aria-hidden="true">{{ item.label }}</span>
              </a>
            } @else {
              <button type="button" class="dock__item" [attr.aria-label]="item.label" (click)="item.action?.()">
                <sh-icon [name]="item.icon" />
                <span class="dock__tip" aria-hidden="true">{{ item.label }}</span>
              </button>
            }
          </li>
        }
      </ul>

      <div class="side">
        @if (user(); as u) {
          <a class="level" routerLink="/profile" [attr.aria-label]="'Level ' + u.level + ', ' + u.xp + ' of ' + u.xpToNextLevel + ' XP'">
            <span class="level__badge mono">L{{ u.level }}</span>
            <span class="level__bar" aria-hidden="true"><span [style.width.%]="xpPercent()"></span></span>
            <sh-avatar [name]="u.displayName" [hue]="u.avatarHue" [src]="u.avatarUrl" [size]="32" />
          </a>
        } @else if (auth.status() === 'anonymous') {
          <a class="cta" routerLink="/register">Start climbing</a>
        }

        <button
          type="button"
          class="menu-btn"
          [attr.aria-expanded]="open()"
          aria-controls="dock-menu"
          [attr.aria-label]="open() ? 'Close menu' : 'Open menu'"
          (click)="toggle()"
        >
          <sh-icon [name]="open() ? 'x' : 'menu'" />
        </button>
      </div>
    </nav>

    <!-- Mobile menu -->
    <div class="sheet" id="dock-menu" [class.is-open]="open()" [attr.inert]="open() ? null : ''">
      <ul class="sheet__list">
        @for (item of items(); track item.id; let i = $index) {
          <li [style.--i]="i">
            @if (item.link) {
              <a class="sheet__item" [routerLink]="item.link" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: item.link === '/' }">
                <span class="sheet__icon"><sh-icon [name]="item.icon" /></span>
                {{ item.label }}
              </a>
            } @else {
              <button type="button" class="sheet__item" (click)="item.action?.(); close()">
                <span class="sheet__icon"><sh-icon [name]="item.icon" /></span>
                {{ item.label }}
              </button>
            }
          </li>
        }
      </ul>
    </div>
    <div class="scrim" [class.is-open]="open()" (click)="close()" aria-hidden="true"></div>
  `,
  styles: `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: var(--z-dock);
      padding: max(0.6rem, env(safe-area-inset-top)) var(--gutter) 0;
      pointer-events: none;
    }

    .bar {
      pointer-events: auto;
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      max-width: var(--container);
      height: var(--dock-h);
      margin-inline: auto;
      padding: 0 0.5rem 0 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--bg) 62%, transparent);
      -webkit-backdrop-filter: blur(18px) saturate(1.3);
      backdrop-filter: blur(18px) saturate(1.3);
      transition: border-color 300ms ease, box-shadow 300ms ease, background-color 300ms ease;
    }

    :host(.is-scrolled) .bar {
      border-color: var(--line-strong);
      box-shadow: var(--shadow-deep);
      background: color-mix(in srgb, var(--bg) 80%, transparent);
    }

    /* --- brand --- */
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 44px;
      color: var(--heading);
      text-decoration: none;
      flex-shrink: 0;
    }

    .brand__mark { width: 30px; height: 30px; }

    .brand__name {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 1.02rem;
      letter-spacing: -0.02em;
    }

    .brand__name span { color: var(--ember); text-shadow: 0 0 18px rgba(var(--ember-rgb), 0.6); }

    /* --- dock (desktop) --- */
    .dock {
      display: none;
      align-items: center;
      gap: 0.4rem;
      height: 100%;
      margin: 0 auto;
      padding: 0 0.5rem;
      list-style: none;
    }

    .dock__slot { display: flex; }

    .dock__item {
      --s: 42px; /* = BASE */
      position: relative;
      display: grid;
      place-items: center;
      width: var(--s);
      height: var(--s);
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--surface-2);
      color: var(--text-soft);
      text-decoration: none;
      transition: color 200ms ease, border-color 200ms ease, background-color 200ms ease, box-shadow 200ms ease;
    }

    .dock__item sh-icon {
      width: calc(var(--s) * 0.46);
      height: calc(var(--s) * 0.46);
    }

    .dock__item:hover,
    .dock__item:focus-visible {
      color: var(--heading);
      border-color: rgba(var(--ember-rgb), 0.5);
    }

    .dock__item.is-active {
      color: var(--ember);
      border-color: rgba(var(--ember-rgb), 0.55);
      background: rgba(var(--ember-rgb), 0.1);
      box-shadow: var(--glow-sm);
    }

    .dock__item.is-active::after {
      content: '';
      position: absolute;
      bottom: -7px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--ember);
      box-shadow: var(--glow-sm);
    }

    .dock__tip {
      position: absolute;
      top: calc(100% + 12px);
      left: 50%;
      padding: 0.2rem 0.6rem;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-solid);
      color: var(--heading);
      font-size: var(--fs-xs);
      font-weight: 600;
      white-space: nowrap;
      opacity: 0;
      transform: translate(-50%, -4px);
      pointer-events: none;
      transition: opacity 160ms ease, transform 200ms var(--ease-out);
    }

    .dock__item:hover .dock__tip,
    .dock__item:focus-visible .dock__tip {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    /* --- right side --- */
    .side {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: auto;
    }

    .level {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 44px;
      padding: 0.25rem 0.3rem 0.25rem 0.75rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      color: var(--heading);
      text-decoration: none;
      transition: border-color 200ms ease;
    }

    .level:hover { border-color: rgba(var(--ember-rgb), 0.5); color: var(--heading); }

    .level__badge {
      font-size: var(--fs-xs);
      font-weight: 700;
      color: var(--gold);
    }

    .level__bar {
      display: none;
      width: 64px;
      height: 5px;
      border-radius: var(--radius-pill);
      background: var(--surface-3);
      overflow: hidden;
    }

    .level__bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--ember-strong), var(--gold));
      box-shadow: var(--glow-sm);
      transition: width 700ms var(--ease-out);
    }

    .cta {
      display: none;
      align-items: center;
      min-height: 40px;
      padding: 0 1rem;
      border-radius: var(--radius-pill);
      background: var(--ember-strong);
      color: #fff;
      font-weight: 700;
      font-size: var(--fs-sm);
      text-decoration: none;
      box-shadow: var(--glow-sm);
    }

    .cta:hover { color: #fff; background: var(--ember); }

    .menu-btn {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--surface-2);
      color: var(--heading);
    }

    /* --- mobile sheet --- */
    .sheet {
      pointer-events: auto;
      position: relative;
      z-index: 2;
      max-width: var(--container);
      margin: 0.5rem auto 0;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-panel);
      background: var(--surface-solid);
      box-shadow: var(--shadow-deep);
      overflow: hidden;
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
      transform-origin: top right;
      visibility: hidden;
      transition: opacity 220ms ease, transform 320ms var(--ease-out), visibility 0s linear 320ms;
    }

    .sheet.is-open {
      opacity: 1;
      transform: none;
      visibility: visible;
      transition: opacity 220ms ease, transform 320ms var(--ease-out), visibility 0s;
    }

    .sheet__list {
      margin: 0;
      padding: 0.5rem;
      list-style: none;
    }

    .sheet__list li {
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity 260ms ease, transform 320ms var(--ease-out);
    }

    .sheet.is-open .sheet__list li {
      opacity: 1;
      transform: none;
      transition-delay: calc(var(--i) * 45ms + 60ms);
    }

    .sheet__item {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      width: 100%;
      min-height: 52px;
      padding: 0.4rem 0.75rem;
      border: 0;
      border-radius: var(--radius-input);
      background: transparent;
      color: var(--text);
      font-weight: 600;
      text-align: left;
      text-decoration: none;
    }

    .sheet__item:hover { background: var(--surface-2); color: var(--heading); }
    .sheet__item.is-active { color: var(--ember); background: rgba(var(--ember-rgb), 0.08); }

    .sheet__icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--surface-2);
    }

    .scrim {
      position: fixed;
      inset: 0;
      z-index: 1;
      background: rgba(0, 0, 0, 0.45);
      opacity: 0;
      visibility: hidden;
      transition: opacity 240ms ease, visibility 0s linear 240ms;
    }

    .scrim.is-open {
      pointer-events: auto;
      opacity: 1;
      visibility: visible;
      transition: opacity 240ms ease, visibility 0s;
    }

    @media (min-width: 480px) {
      .cta { display: inline-flex; }
    }

    @media (min-width: 768px) {
      .dock { display: flex; }
      .menu-btn, .sheet, .scrim { display: none; }
      .level__bar { display: block; }
      /* Centre the dock between brand and side */
      .brand, .side { flex: 1 1 0; }
      .side { justify-content: flex-end; }
    }
  `,
})
export class FloatingDockComponent {
  protected readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dockRef = viewChild.required<ElementRef<HTMLUListElement>>('dock');

  protected readonly open = signal(false);
  protected readonly scrolled = signal(false);
  protected readonly user = this.auth.user;

  protected readonly xpPercent = computed(() => {
    const u = this.user();
    return u && u.xpToNextLevel ? Math.min(100, Math.round((u.xp / u.xpToNextLevel) * 100)) : 0;
  });

  protected readonly items = computed<DockItem[]>(() => {
    const themeItem: DockItem = {
      id: 'theme',
      label: this.theme.theme() === 'dark' ? 'Light theme' : 'Dark theme',
      icon: this.theme.theme() === 'dark' ? 'sun' : 'moon',
      action: () => this.theme.toggle(),
    };

    if (this.auth.isAuthenticated()) {
      return [
        { id: 'home', label: 'Summit', icon: 'mountain', link: '/' },
        { id: 'dashboard', label: 'Dashboard', icon: 'grid', link: '/dashboard' },
        { id: 'profile', label: 'Profile', icon: 'user', link: '/profile' },
        themeItem,
        { id: 'logout', label: 'Sign out', icon: 'logout', action: () => this.auth.logout() },
      ];
    }
    return [
      { id: 'home', label: 'Home', icon: 'mountain', link: '/' },
      { id: 'login', label: 'Sign in', icon: 'lock', link: '/login' },
      { id: 'register', label: 'Create account', icon: 'spark', link: '/register' },
      themeItem,
    ];
  });

  // magnification state
  private pointerX: number | null = null;
  private readonly sizes = new Map<HTMLElement, number>();
  private frame = 0;
  private readonly magnify = !prefersReducedMotion();

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());

    // Lock page scroll behind the open mobile menu
    effect(() => {
      const open = this.open();
      untracked(() => document.documentElement.style.setProperty('overflow', open ? 'hidden' : ''));
    });

    afterNextRender(() => {
      const onScroll = () => this.scrolled.set(window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(this.frame);
        document.documentElement.style.removeProperty('overflow');
      });
    });
  }

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected track(event: PointerEvent): void {
    if (!this.magnify || event.pointerType !== 'mouse') return;
    this.pointerX = event.clientX;
    this.schedule();
  }

  protected release(): void {
    this.pointerX = null;
    this.schedule();
  }

  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.step());
  }

  /** One spring step for every item; keeps running until all sizes settle */
  private step(): void {
    this.frame = 0;
    const items = this.dockRef().nativeElement.querySelectorAll<HTMLElement>('.dock__item');
    let moving = false;

    items.forEach((el) => {
      const current = this.sizes.get(el) ?? BASE;
      let target = BASE;
      if (this.pointerX !== null) {
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(this.pointerX - (rect.left + rect.width / 2));
        target = distance >= RANGE ? BASE : BASE + (MAX - BASE) * Math.cos((distance / RANGE) * (Math.PI / 2));
      }
      const next = current + (target - current) * SPRING;
      const settled = Math.abs(target - next) < 0.2;
      const value = settled ? target : next;
      if (!settled) moving = true;
      this.sizes.set(el, value);
      el.style.setProperty('--s', `${value.toFixed(2)}px`);
    });

    if (moving) this.schedule();
  }
}
