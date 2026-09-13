import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { prefersReducedMotion, useGsap } from '../../../core/animations/gsap';
import type { Habit } from '../../../core/models/habit.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar';
import { ButtonComponent } from '../../../shared/components/button/button';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { IconComponent } from '../../../shared/components/icon/icon';
import { ProgressRingComponent } from '../../../shared/components/progress-ring/progress-ring';
import { SpotlightDirective } from '../../../shared/directives/spotlight.directive';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { ParticleBurstService } from '../../../shared/services/particle-burst.service';
import { formatDuration } from '../../../shared/utils/time-format';
import { injectCooldown } from '../data/cooldown';
import { HabitsStore } from '../data/habits.store';

const FRIEND_PULSE_MS = 3200;

/**
 * One habit on the dashboard — the "check-in" showcase.
 *
 * State flow for a click:
 *   ready ─click→ (optimistic count+1, cooldown starts, sparks fly)
 *         ├─ server OK      → server habit replaces the optimistic one
 *         └─ server refuses → store rolls back, the card shakes
 *
 * The cooldown runs on server time (`injectCooldown`), the ice arc inside the
 * ring drains with it, and the moment it hits zero the button pulses.
 */
@Component({
  selector: 'sh-habit-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvatarComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    IconComponent,
    ProgressRingComponent,
    RelativeTimePipe,
    SpotlightDirective,
  ],
  host: {
    '[attr.data-phase]': 'cooldown.phase()',
    '[class.is-shared]': 'habit().shared.enabled',
  },
  template: `
    <article #card class="card panel" shSpotlight [attr.aria-labelledby]="'habit-' + habit().id">
      <header class="head">
        <span class="tile" aria-hidden="true"><sh-icon [name]="habit().icon" /></span>
        <div class="head__text">
          <h3 [id]="'habit-' + habit().id">
            <a [routerLink]="['/habits', habit().id]" class="title-link">{{ habit().title }}</a>
          </h3>
          <p class="meta">
            {{ habit().frequency === 'daily' ? 'Daily' : 'Weekly' }}
            @if (habit().kind === 'cumulative') {
              · {{ habit().progress.target }} {{ habit().unit || 'times' }}
            }
            @if (habit().cooldownSeconds > 0) {
              · every {{ cooldownText() }}
            }
          </p>
        </div>
        <button
          shButton
          variant="ghost"
          size="sm"
          iconOnly
          type="button"
          class="delete"
          [attr.aria-label]="(isOwner() ? 'Delete ' : 'Leave ') + habit().title"
          [disabled]="deleting()"
          (click)="remove()"
        >
          <sh-icon [name]="isOwner() ? 'trash' : 'door'" />
        </button>
      </header>

      <div class="body">
        <sh-progress-ring
          #ring
          [value]="progressValue()"
          [cooldown]="cooldown.fraction()"
          [size]="116"
          [stroke]="8"
          [label]="ringLabel()"
        >
          @switch (cooldown.phase()) {
            @case ('completed') {
              <span class="center center--done"><sh-icon name="check" /><small>done</small></span>
            }
            @case ('cooldown') {
              <span class="center"><strong class="mono">{{ cooldown.label() }}</strong><small>cooling</small></span>
            }
            @default {
              <span class="center">
                <strong #count class="mono">{{ habit().progress.count }}<span class="of">/{{ habit().progress.target }}</span></strong>
                <small>{{ habit().unit || (habit().kind === 'binary' ? 'today' : 'times') }}</small>
              </span>
            }
          }
        </sh-progress-ring>

        <div class="facts">
          <span class="badge" [class.badge--ember]="habit().streak.current > 0" [attr.aria-label]="habit().streak.current + ' day streak'">
            <sh-icon name="flame" /> {{ habit().streak.current }}
            <span class="muted-inline">best {{ habit().streak.best }}</span>
          </span>

          @if (habit().shared.enabled) {
            <a class="badge badge--link" [routerLink]="['/habits', habit().id]">
              <sh-icon [name]="habit().shared.mode === 'team' ? 'users' : 'swords'" />
              {{ habit().shared.membersCount }} · {{ habit().shared.mode === 'team' ? 'Team' : 'Versus' }}
            </a>
          }

          <span class="last">
            <sh-icon name="clock" />
            {{ habit().lastCheckInAt ? (habit().lastCheckInAt | relativeTime) : 'No check-ins yet' }}
          </span>

          @if (friend(); as f) {
            <span class="friend" #friendEl role="status">
              <sh-avatar [name]="f.displayName" [hue]="f.avatarHue" [size]="22" [ring]="true" />
              {{ firstName(f.displayName) }} checked in
            </span>
          }
        </div>
      </div>

      <footer class="foot">
        <button
          #btn
          shButton
          block
          type="button"
          class="checkin"
          [variant]="cooldown.phase() === 'ready' ? 'spin' : 'ghost'"
          [busy]="cooldown.phase() === 'pending'"
          [disabled]="cooldown.phase() !== 'ready'"
          [attr.aria-describedby]="'habit-' + habit().id + '-state'"
          (click)="checkIn()"
        >
          @switch (cooldown.phase()) {
            @case ('ready') {
              <sh-icon name="bolt" /> Check in <span class="xp mono">+{{ habit().xpPerCheckIn }} XP</span>
            }
            @case ('pending') {
              Saving…
            }
            @case ('cooldown') {
              <sh-icon name="clock" /> Ready in <span class="mono">{{ cooldown.label() }}</span>
            }
            @case ('completed') {
              <sh-icon name="trophy" /> {{ habit().frequency === 'daily' ? 'Done for today' : 'Done this week' }}
            }
          }
        </button>
        <p class="visually-hidden" [id]="'habit-' + habit().id + '-state'" aria-live="polite">{{ srState() }}</p>
        <a class="room-link" [routerLink]="['/habits', habit().id]">
          {{ habit().shared.enabled ? 'Open room' : 'Invite friends' }} <sh-icon name="arrow-right" />
        </a>
      </footer>
    </article>

    <sh-confirm-dialog
      #confirm
      [heading]="isOwner() ? 'Delete this habit?' : 'Leave this habit?'"
      [message]="deleteMessage()"
      [confirmLabel]="isOwner() ? 'Delete habit' : 'Leave'"
    />
  `,
  styles: `
    :host { display: block; }

    .card {
      display: grid;
      gap: 1.1rem;
      height: 100%;
      padding: 1.1rem;
      border-radius: var(--radius-card);
      transition: border-color 300ms ease, box-shadow 300ms ease;
    }

    :host([data-phase='completed']) .card {
      border-color: rgba(var(--gold-rgb), 0.35);
      box-shadow: var(--shadow-deep), 0 0 50px -24px rgba(var(--gold-rgb), 0.6);
    }

    .head { display: flex; align-items: flex-start; gap: 0.8rem; }

    .tile {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
      border-radius: 14px;
      background: linear-gradient(145deg, rgba(var(--ember-rgb), 0.28), rgba(var(--ember-rgb), 0.04));
      border: 1px solid rgba(var(--ember-rgb), 0.3);
      color: var(--ember-soft);
    }

    .tile sh-icon { width: 22px; height: 22px; }

    .head__text { flex: 1; min-width: 0; }

    h3 { margin: 0; font-size: 1.08rem; line-height: 1.25; }

    .title-link { color: var(--heading); text-decoration: none; overflow-wrap: anywhere; }
    .title-link:hover { color: var(--ember-soft); }

    .meta { margin: 0.2rem 0 0; font-size: var(--fs-xs); color: var(--text-muted); }

    .delete { opacity: 0.55; transition: opacity 200ms ease; }
    .card:hover .delete, .delete:focus-visible { opacity: 1; }

    .body { display: flex; align-items: center; gap: 1.1rem; }

    .center { display: grid; justify-items: center; gap: 0.1rem; line-height: 1; }
    .center strong { font-size: 1.55rem; color: var(--heading); letter-spacing: -0.02em; }
    .center .of { font-size: 0.95rem; color: var(--text-muted); }
    .center small { font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .center--done { color: var(--gold); }
    .center--done sh-icon { width: 30px; height: 30px; filter: drop-shadow(0 0 8px rgba(var(--gold-rgb), 0.7)); }

    :host([data-phase='cooldown']) .center strong { font-size: 1.25rem; color: var(--ice); }

    .facts { display: flex; flex-wrap: wrap; align-content: center; gap: 0.45rem; min-width: 0; }

    .muted-inline { color: var(--text-muted); font-weight: 500; }

    .badge--link { text-decoration: none; }
    .badge--link:hover { border-color: rgba(var(--ember-rgb), 0.6); color: var(--heading); }

    .last {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      font-size: var(--fs-xs);
      color: var(--text-muted);
    }

    .last sh-icon { width: 13px; height: 13px; }

    .friend {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.2rem 0.65rem 0.2rem 0.25rem;
      border-radius: var(--radius-pill);
      background: rgba(var(--ember-rgb), 0.14);
      color: var(--ember-soft);
      font-size: var(--fs-xs);
      font-weight: 600;
    }

    .foot { display: grid; gap: 0.6rem; margin-top: auto; }

    .xp { margin-left: 0.2rem; font-size: 0.78rem; color: var(--gold); }

    .room-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      min-height: 32px;
      font-size: var(--fs-sm);
      color: var(--text-soft);
      text-decoration: none;
    }

    .room-link sh-icon { width: 15px; height: 15px; transition: transform 200ms var(--ease-out); }
    .room-link:hover { color: var(--ember-soft); }
    .room-link:hover sh-icon { transform: translateX(3px); }
  `,
})
export class HabitCardComponent {
  readonly habit = input.required<Habit>();

  private readonly store = inject(HabitsStore);
  private readonly particles = inject(ParticleBurstService);

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly ring = viewChild.required(ProgressRingComponent, { read: ElementRef });
  private readonly btn = viewChild.required('btn', { read: ElementRef });
  private readonly countEl = viewChild<ElementRef<HTMLElement>>('count');
  private readonly friendEl = viewChild<ElementRef<HTMLElement>>('friendEl');
  private readonly confirm = viewChild.required(ConfirmDialogComponent);

  protected readonly pending = computed(() => this.store.pending().has(this.habit().id));
  protected readonly cooldown = injectCooldown(this.habit, this.pending);
  protected readonly deleting = signal(false);

  protected readonly progressValue = computed(() => {
    const { count, target } = this.habit().progress;
    return target ? count / target : 0;
  });

  protected readonly cooldownText = computed(() => formatDuration(this.habit().cooldownSeconds));

  protected readonly ringLabel = computed(() => {
    const h = this.habit();
    return `${h.progress.count} of ${h.progress.target} ${h.unit ?? 'check-ins'}`;
  });

  protected readonly srState = computed(() => {
    switch (this.cooldown.phase()) {
      case 'ready': return 'Ready to check in.';
      case 'pending': return 'Saving check-in.';
      case 'completed': return 'Target reached for this period.';
      case 'cooldown': return `Cooling down, ready in ${formatDuration(Math.ceil(this.cooldown.remainingMs() / 1000))}.`;
    }
  });

  protected readonly isOwner = computed(() => this.habit().shared.role === 'owner');

  protected readonly deleteMessage = computed(() => {
    const h = this.habit();
    if (!this.isOwner()) return `You’ll leave the “${h.title}” room. Your progress there will be removed.`;
    return h.shared.enabled && h.shared.membersCount > 1
      ? `“${h.title}” and its room will be removed for all ${h.shared.membersCount} members.`
      : `“${h.title}”, its streak and history will be removed. This can’t be undone.`;
  });

  /** Friend check-in chip, auto-hidden after a few seconds */
  protected readonly friend = signal<{ displayName: string; avatarHue: number } | null>(null);
  private friendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPulseSeq = 0;
  private lastCount: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.friendTimer && clearTimeout(this.friendTimer));

    // Cooldown just ended → pulse the button and the ring
    effect(() => {
      if (this.cooldown.readyTicks() === 0) return;
      untracked(() => this.animateReady());
    });

    // Count went up (mine or a server update) → pop the number
    effect(() => {
      const count = this.habit().progress.count;
      untracked(() => {
        if (this.lastCount !== null && count > this.lastCount) this.pop(this.countEl()?.nativeElement);
        this.lastCount = count;
      });
    });

    // A friend checked in on this shared habit
    effect(() => {
      const pulse = this.store.friendPulse();
      untracked(() => {
        if (!pulse || pulse.habitId !== this.habit().id || pulse.seq === this.lastPulseSeq) return;
        this.lastPulseSeq = pulse.seq;
        this.friend.set({ displayName: pulse.displayName, avatarHue: pulse.avatarHue });
        if (this.friendTimer) clearTimeout(this.friendTimer);
        this.friendTimer = setTimeout(() => this.friend.set(null), FRIEND_PULSE_MS);
        queueMicrotask(() => this.pop(this.friendEl()?.nativeElement, 1.25));
      });
    });
  }

  protected firstName(name: string): string {
    return name.split(/\s+/)[0] ?? name;
  }

  protected async checkIn(): Promise<void> {
    if (this.cooldown.phase() !== 'ready') return;
    const habit = this.habit();
    const completes = habit.progress.count + 1 >= habit.progress.target;
    const button = this.btn().nativeElement as HTMLElement;

    // Celebrate immediately — the UI is optimistic, the store rolls back if needed
    this.particles.fromElement(button, { label: `+${habit.xpPerCheckIn} XP` });
    if (completes) {
      setTimeout(() => this.particles.fromElement(this.ring().nativeElement, { kind: 'confetti' }), 180);
    }

    const outcome = await this.store.checkIn(habit.id);
    if (!outcome.ok) this.shake();
  }

  protected async remove(): Promise<void> {
    if (this.deleting()) return;
    if (!(await this.confirm().ask())) return;
    this.deleting.set(true);
    const ok = await this.store.remove(this.habit().id);
    // On success the card is gone; on failure it's back in place
    if (!ok) this.deleting.set(false);
  }

  // --- motion --------------------------------------------------------------------

  private shake(): void {
    const el = this.card().nativeElement;
    if (prefersReducedMotion()) return;
    const { gsap } = useGsap();
    gsap.fromTo(
      el,
      { x: 0 },
      {
        keyframes: { x: [0, -10, 9, -6, 4, -2, 0] },
        duration: 0.5,
        ease: 'power2.out',
        clearProps: 'transform',
      },
    );
    gsap.fromTo(
      el,
      { boxShadow: '0 0 0 1px rgba(255, 83, 100, 0.9), 0 0 36px -6px rgba(255, 83, 100, 0.6)' },
      { boxShadow: '0 0 0 1px rgba(255, 83, 100, 0), 0 0 0 0 rgba(255, 83, 100, 0)', duration: 0.9, clearProps: 'boxShadow' },
    );
  }

  private animateReady(): void {
    if (prefersReducedMotion()) return;
    const { gsap } = useGsap();
    const button = this.btn().nativeElement as HTMLElement;
    gsap.fromTo(button, { scale: 1 }, { scale: 1.05, duration: 0.18, yoyo: true, repeat: 3, ease: 'sine.inOut', clearProps: 'transform' });
    gsap.fromTo(
      this.ring().nativeElement,
      { filter: 'drop-shadow(0 0 0 rgba(255,122,26,0))' },
      { filter: 'drop-shadow(0 0 18px rgba(255,122,26,0.85))', duration: 0.35, yoyo: true, repeat: 1, clearProps: 'filter' },
    );
  }

  private pop(el: HTMLElement | undefined, from = 1.35): void {
    if (!el || prefersReducedMotion()) return;
    const { gsap } = useGsap();
    gsap.fromTo(el, { scale: from }, { scale: 1, duration: 0.55, ease: 'back.out(3)', clearProps: 'transform' });
  }
}
