import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { fadeSlide, listStagger } from '../../core/animations/route-animations';
import { prefersReducedMotion, useGsap } from '../../core/animations/gsap';
import { AuthService } from '../../core/auth/auth.service';
import { ServerClock } from '../../core/time/server-clock.service';
import { ButtonComponent } from '../../shared/components/button/button';
import { IconComponent } from '../../shared/components/icon/icon';
import { ProgressRingComponent } from '../../shared/components/progress-ring/progress-ring';
import { SummitArtComponent } from '../../shared/components/summit-art/summit-art';
import { SpotlightDirective } from '../../shared/directives/spotlight.directive';
import { CreateHabitDialogComponent } from '../habits/create-habit/create-habit-dialog';
import { HabitsStore } from '../habits/data/habits.store';
import { HabitCardComponent } from '../habits/habit-card/habit-card';

@Component({
  selector: 'sh-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    CreateHabitDialogComponent,
    HabitCardComponent,
    IconComponent,
    ProgressRingComponent,
    SpotlightDirective,
    SummitArtComponent,
  ],
  animations: [fadeSlide, listStagger],
  template: `
    <div class="page container">
      <section class="hero panel" shSpotlight aria-labelledby="dash-title">
        <sh-summit-art class="hero__art" focus="70% 40%" />
        <div class="hero__content">
          <div class="hero__text">
            <p class="eyebrow">{{ greeting() }}</p>
            <h1 id="dash-title">{{ firstName() }}, {{ headline() }}</h1>

            @if (auth.user(); as user) {
              <div class="level" [attr.aria-label]="'Level ' + user.level + ', ' + user.xp + ' of ' + user.xpToNextLevel + ' XP'">
                <span class="level__badge mono">LV {{ user.level }}</span>
                <div class="level__bar" aria-hidden="true">
                  <span [style.width.%]="xpPercent()"></span>
                </div>
                <span class="level__xp mono">{{ user.xp }}/{{ user.xpToNextLevel }} XP</span>
              </div>
            }
          </div>

          <div class="stats">
            <sh-progress-ring
              class="stats__ring"
              [value]="stats().percent / 100"
              [size]="132"
              [stroke]="10"
              [label]="stats().done + ' of ' + stats().total + ' habits done'"
            >
              <span class="ring-center">
                <strong class="mono">{{ stats().percent }}%</strong>
                <small>{{ stats().done }}/{{ stats().total }} done</small>
              </span>
            </sh-progress-ring>

            <dl class="stats__list">
              <div>
                <dt><sh-icon name="flame" /> Best streak</dt>
                <dd class="mono">{{ stats().bestStreak }}</dd>
              </div>
              <div>
                <dt><sh-icon name="users" /> Shared</dt>
                <dd class="mono">{{ stats().shared }}</dd>
              </div>
              <div>
                <dt><sh-icon name="target" /> Left today</dt>
                <dd class="mono">{{ stats().total - stats().done }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      @if (clock.deviceClockSkewed()) {
        <p class="alert alert--info" role="status" @fadeSlide>
          <sh-icon name="clock" />
          Your device clock is off. Cooldowns follow the server time, so timers may differ from your clock.
        </p>
      }

      <div class="toolbar">
        <h2>Your habits</h2>
        <button shButton type="button" (click)="createDialog.open()"><sh-icon name="plus" /> New habit</button>
      </div>

      @switch (view()) {
        @case ('loading') {
          <div class="grid" aria-busy="true" aria-label="Loading habits">
            @for (i of skeletons; track i) {
              <div class="skel panel">
                <div class="skel__head">
                  <span class="skeleton skel__tile"></span>
                  <span class="skel__lines"><span class="skeleton"></span><span class="skeleton short"></span></span>
                </div>
                <div class="skel__body">
                  <span class="skeleton skel__ring"></span>
                  <span class="skel__lines"><span class="skeleton"></span><span class="skeleton short"></span></span>
                </div>
                <span class="skeleton skel__btn"></span>
              </div>
            }
          </div>
        }

        @case ('error') {
          <div class="state panel" role="alert">
            <sh-icon name="wifi-off" />
            <h3>Couldn’t reach basecamp</h3>
            <p class="muted">{{ store.error()?.message || 'Something went wrong while loading your habits.' }}</p>
            <button shButton variant="ghost" type="button" (click)="store.load(true)">Try again</button>
          </div>
        }

        @case ('empty') {
          <div class="state state--empty panel">
            <sh-icon name="mountain" />
            <h3>Your mountain is empty</h3>
            <p class="muted">Add a first habit — or a shared one and invite a friend to climb with you.</p>
            <button shButton size="lg" type="button" (click)="createDialog.open()"><sh-icon name="plus" /> Create your first habit</button>
          </div>
        }

        @default {
          @if (store.error() && store.status() === 'ready') {
            <p class="alert" role="status" @fadeSlide>
              <sh-icon name="wifi-off" /> Showing the last known state — live data couldn’t be refreshed.
            </p>
          }
          <div #grid class="grid" [@.disabled]="!listAnimations()" [@listStagger]="store.habits().length">
            @for (habit of store.habits(); track habit.id) {
              <sh-habit-card [habit]="habit" />
            }
          </div>
        }
      }
    </div>

    <sh-create-habit-dialog #createDialog />
  `,
  styles: `
    :host { display: block; }

    .page { display: grid; gap: 1.5rem; }

    .hero {
      overflow: hidden;
      display: grid;
      min-height: 280px;
      border-radius: var(--radius-panel);
    }

    .hero__art { position: absolute; inset: 0; opacity: 0.55; }

    .hero__content {
      position: relative;
      display: grid;
      gap: 1.5rem;
      align-content: end;
      padding: clamp(1.1rem, 0.8rem + 2vw, 2.25rem);
      background: linear-gradient(90deg, rgba(var(--bg-rgb, 7, 8, 12), 0.85), transparent 90%);
    }

    h1 {
      margin: 0.4rem 0 0;
      max-width: 18ch;
      font-size: var(--fs-h1);
      letter-spacing: -0.03em;
      line-height: 1.05;
    }

    .level { display: flex; align-items: center; gap: 0.7rem; margin-top: 1rem; max-width: 420px; }

    .level__badge {
      padding: 0.25rem 0.55rem;
      border-radius: 8px;
      background: linear-gradient(180deg, var(--ember), var(--ember-strong));
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      box-shadow: var(--glow-sm);
    }

    .level__bar {
      flex: 1;
      height: 8px;
      border-radius: var(--radius-pill);
      background: rgba(var(--ink-rgb), 0.1);
      overflow: hidden;
    }

    .level__bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--ember), var(--gold));
      box-shadow: 0 0 12px rgba(var(--ember-rgb), 0.8);
      transition: width 700ms var(--ease-out);
    }

    .level__xp { font-size: var(--fs-xs); color: var(--text-soft); }

    .stats { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }

    .ring-center { display: grid; justify-items: center; gap: 0.15rem; }
    .ring-center strong { font-size: 1.7rem; color: var(--heading); }
    .ring-center small { font-size: 0.7rem; color: var(--text-muted); }

    .stats__list { display: grid; gap: 0.5rem; margin: 0; }
    .stats__list div { display: flex; justify-content: space-between; gap: 1.5rem; min-width: 160px; }
    dt { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--text-soft); font-size: var(--fs-sm); }
    dt sh-icon { width: 16px; height: 16px; color: var(--ember); }
    dd { margin: 0; color: var(--heading); font-weight: 700; }

    @media (min-width: 900px) {
      .hero__content { grid-template-columns: 1fr auto; align-items: end; }
    }

    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .toolbar h2 { margin: 0; font-size: var(--fs-h2); }

    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr));
      align-items: stretch;
    }

    .skel { display: grid; gap: 1.1rem; padding: 1.1rem; border-radius: var(--radius-card); }
    .skel__head, .skel__body { display: flex; align-items: center; gap: 0.9rem; }
    .skel__tile { width: 44px; height: 44px; border-radius: 14px; }
    .skel__ring { width: 116px; height: 116px; border-radius: 50%; flex-shrink: 0; }
    .skel__lines { display: grid; gap: 0.5rem; flex: 1; }
    .skel__lines .skeleton { height: 12px; }
    .skel__lines .short { width: 55%; }
    .skel__btn { height: 50px; border-radius: var(--radius-pill); }

    .state {
      display: grid;
      justify-items: center;
      gap: 0.6rem;
      padding: 2.5rem 1.25rem;
      text-align: center;
    }

    .state > sh-icon { width: 42px; height: 42px; color: var(--ember); filter: drop-shadow(0 0 12px rgba(var(--ember-rgb), 0.6)); }
    .state h3 { margin: 0.4rem 0 0; font-size: var(--fs-h3); }
    .state p { margin: 0 0 0.6rem; max-width: 42ch; }
  `,
})
export class DashboardPage {
  protected readonly store = inject(HabitsStore);
  protected readonly auth = inject(AuthService);
  protected readonly clock = inject(ServerClock);

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  protected readonly skeletons = [0, 1, 2];
  protected readonly stats = this.store.stats;

  protected readonly view = computed(() => {
    const status = this.store.status();
    if (status === 'idle' || status === 'loading') return 'loading';
    if (status === 'error') return 'error';
    return this.store.isEmpty() ? 'empty' : 'list';
  });

  protected readonly firstName = computed(() => this.auth.user()?.displayName.split(/\s+/)[0] ?? 'Climber');

  protected readonly greeting = computed(() => {
    const hour = new Date(this.clock.now()).getHours();
    if (hour < 5) return 'Night shift';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly headline = computed(() => {
    const { total, done } = this.stats();
    if (!total) return 'let’s pick a peak.';
    if (done === total) return 'summit reached today.';
    if (done === 0) return 'the trail is waiting.';
    return `${total - done} to the summit.`;
  });

  protected readonly xpPercent = computed(() => {
    const user = this.auth.user();
    return user && user.xpToNextLevel ? Math.min(100, (user.xp / user.xpToNextLevel) * 100) : 0;
  });

  /** Angular list animations take over after the GSAP intro */
  protected readonly listAnimations = signal(false);
  private animatedGrid = false;

  constructor() {
    this.store.load();
    inject(DestroyRef).onDestroy(this.store.enableLiveUpdates());

    // First paint of the list → GSAP stagger (later additions use @listStagger)
    effect(() => {
      const grid = this.grid()?.nativeElement;
      if (!grid || this.animatedGrid) return;
      untracked(() => {
        this.animatedGrid = true;
        this.listAnimations.set(true);
        if (prefersReducedMotion()) return;
        const { gsap } = useGsap();
        gsap.from(grid.children, {
          opacity: 0,
          y: 34,
          scale: 0.97,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.07,
          clearProps: 'opacity,transform',
        });
      });
    });
  }
}
