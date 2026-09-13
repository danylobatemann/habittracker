import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { feedItem, fadeSlide } from '../../core/animations/route-animations';
import { prefersReducedMotion, useGsap } from '../../core/animations/gsap';
import type { ActivityEvent } from '../../core/models/room.models';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { ButtonComponent } from '../../shared/components/button/button';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog';
import { IconComponent } from '../../shared/components/icon/icon';
import { ProgressRingComponent } from '../../shared/components/progress-ring/progress-ring';
import { SpotlightDirective } from '../../shared/directives/spotlight.directive';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { ParticleBurstService } from '../../shared/services/particle-burst.service';
import { formatDuration } from '../../shared/utils/time-format';
import { injectCooldown } from '../habits/data/cooldown';
import { HabitsStore } from '../habits/data/habits.store';
import { RoomStore } from './data/room.store';
import type { Habit } from '../../core/models/habit.models';

const FLASH_MS = 1400;

/** Placeholder until the room snapshot arrives — keeps injectCooldown's signal non-null */
const EMPTY_HABIT: Habit = {
  id: '',
  title: '',
  description: '',
  icon: 'mountain',
  kind: 'binary',
  frequency: 'daily',
  unit: null,
  cooldownSeconds: 0,
  progress: { periodStart: '', count: 0, target: 1, completedAt: null },
  streak: { current: 0, best: 0, expiresAt: null },
  lastCheckInAt: null,
  cooldownEndsAt: null,
  xpPerCheckIn: 0,
  shared: { enabled: false, mode: 'team', membersCount: 1, role: 'member' },
  createdAt: '',
};

@Component({
  selector: 'sh-room-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RoomStore],
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
  animations: [feedItem, fadeSlide],
  template: `
    <div class="page container">
      <a routerLink="/dashboard" class="back"><sh-icon name="arrow-left" /> Dashboard</a>

      @switch (room.status()) {
        @case ('loading') {
          <div class="skel" aria-busy="true" aria-label="Loading room">
            <div class="panel skel__head"><span class="skeleton t1"></span><span class="skeleton t2"></span></div>
            <div class="layout">
              <div class="panel skel__block"><span class="skeleton ring"></span><span class="skeleton bar"></span></div>
              <div class="panel skel__block">
                @for (i of [0, 1, 2, 3]; track i) {
                  <span class="skel__row"><span class="skeleton av"></span><span class="skeleton line"></span></span>
                }
              </div>
            </div>
          </div>
        }

        @case ('error') {
          <div class="state panel" role="alert">
            <sh-icon [name]="room.error()?.code === 'NOT_FOUND' || room.error()?.code === 'FORBIDDEN' ? 'door' : 'wifi-off'" />
            <h1>{{ errorTitle() }}</h1>
            <p class="muted">{{ room.error()?.message }}</p>
            <div class="state__actions">
              <a shButton variant="ghost" routerLink="/dashboard">Back to dashboard</a>
              @if (room.error()?.isNetwork || room.error()?.isServer) {
                <button shButton type="button" (click)="room.refresh()">Try again</button>
              }
            </div>
          </div>
        }

        @default {
          @if (room.habit(); as h) {
            <header class="head panel" shSpotlight>
              <span class="tile" aria-hidden="true"><sh-icon [name]="h.icon" /></span>
              <div class="head__text">
                <p class="eyebrow">
                  {{ h.shared.mode === 'competitive' ? 'Versus room' : 'Team room' }}
                  <span class="conn" [attr.data-state]="room.connection()" role="status">
                    <span class="conn__dot" aria-hidden="true"></span>{{ connectionLabel() }}
                  </span>
                </p>
                <h1>{{ h.title }}</h1>
                @if (h.description) {
                  <p class="muted desc">{{ h.description }}</p>
                }
                <div class="presence">
                  <span class="stack" aria-hidden="true">
                    @for (m of room.members().slice(0, 5); track m.userId) {
                      <sh-avatar [name]="m.displayName" [hue]="m.avatarHue" [src]="m.avatarUrl" [size]="30" />
                    }
                  </span>
                  <span class="muted">{{ room.members().length }} climbing · {{ room.onlineCount() }} online</span>
                </div>
              </div>
              <div class="head__actions">
                <button shButton type="button" [busy]="room.inviteBusy()" [disabled]="room.inviteBusy()" (click)="room.invite()">
                  <sh-icon name="link" /> Invite
                </button>
                <button shButton variant="ghost" type="button" (click)="leaveOrDelete()">
                  <sh-icon [name]="h.shared.role === 'owner' ? 'trash' : 'door'" />
                  {{ h.shared.role === 'owner' ? 'Delete' : 'Leave' }}
                </button>
              </div>
            </header>

            <div class="layout">
              <div class="col">
                <section class="me panel" aria-labelledby="me-title">
                  <h2 id="me-title" class="visually-hidden">Your progress</h2>
                  <sh-progress-ring
                    #ring
                    [value]="h.progress.count / h.progress.target"
                    [cooldown]="cooldown.fraction()"
                    [size]="168"
                    [stroke]="11"
                    [label]="h.progress.count + ' of ' + h.progress.target"
                  >
                    <span class="ring-center">
                      @if (cooldown.phase() === 'cooldown') {
                        <strong class="mono ice">{{ cooldown.label() }}</strong>
                        <small>cooldown</small>
                      } @else {
                        <strong class="mono">{{ h.progress.count }}<span class="of">/{{ h.progress.target }}</span></strong>
                        <small>{{ h.unit || (h.frequency === 'daily' ? 'today' : 'this week') }}</small>
                      }
                    </span>
                  </sh-progress-ring>

                  <div class="me__side">
                    <p class="streak"><sh-icon name="flame" /> <strong class="mono">{{ h.streak.current }}</strong> streak</p>
                    @if (h.cooldownSeconds > 0) {
                      <p class="muted small">Cooldown {{ cooldownText() }} between check-ins</p>
                    }
                    <button
                      #btn
                      shButton
                      block
                      size="lg"
                      type="button"
                      [variant]="cooldown.phase() === 'ready' ? 'spin' : 'ghost'"
                      [busy]="cooldown.phase() === 'pending'"
                      [disabled]="cooldown.phase() !== 'ready'"
                      (click)="checkIn()"
                    >
                      @switch (cooldown.phase()) {
                        @case ('ready') { <sh-icon name="bolt" /> Check in }
                        @case ('pending') { Saving… }
                        @case ('cooldown') { <sh-icon name="clock" /> <span class="mono">{{ cooldown.label() }}</span> }
                        @case ('completed') { <sh-icon name="trophy" /> Target reached }
                      }
                    </button>
                  </div>
                </section>

                @if (h.shared.mode === 'team') {
                  <section class="team panel" aria-labelledby="team-title">
                    <div class="team__head">
                      <h2 id="team-title"><sh-icon name="mountain" /> Team summit</h2>
                      <span class="mono">{{ room.team().count }}/{{ room.team().target }}</span>
                    </div>
                    <div
                      class="team__bar"
                      role="progressbar"
                      aria-labelledby="team-title"
                      [attr.aria-valuenow]="room.team().percent"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <span [style.width.%]="room.team().percent"></span>
                      @if (room.team().percent >= 100) {
                        <sh-icon name="trophy" class="team__flag" />
                      }
                    </div>
                    <p class="muted small">
                      {{ room.team().percent >= 100 ? 'The whole team made it. Legendary.' : 'Every check-in from anyone moves the team up the mountain.' }}
                    </p>
                  </section>
                }

                <section class="board panel" aria-labelledby="board-title">
                  <h2 id="board-title">
                    <sh-icon [name]="h.shared.mode === 'competitive' ? 'trophy' : 'users'" />
                    {{ h.shared.mode === 'competitive' ? 'Leaderboard' : 'Rope team' }}
                  </h2>
                  <ol class="rows" #rows>
                    @for (m of room.members(); track m.userId) {
                      <li
                        class="row"
                        [attr.data-user]="m.userId"
                        [class.is-me]="m.isMe"
                        [class.is-flash]="flashUser() === m.userId"
                        [class.is-done]="m.count >= m.target"
                      >
                        @if (h.shared.mode === 'competitive') {
                          <span class="rank mono" [attr.data-rank]="m.rank">{{ m.rank }}</span>
                        }
                        <sh-avatar [name]="m.displayName" [hue]="m.avatarHue" [src]="m.avatarUrl" [size]="38" [online]="m.isMe || m.online" [ring]="m.isMe" />
                        <div class="row__main">
                          <p class="row__name">
                            {{ m.displayName }}
                            @if (m.isMe) { <span class="you">you</span> }
                            @if (m.role === 'owner') { <span class="badge">owner</span> }
                          </p>
                          <div class="row__bar" aria-hidden="true"><span [style.width.%]="m.percent"></span></div>
                        </div>
                        <div class="row__stats">
                          <span class="mono">{{ m.count }}/{{ m.target }}</span>
                          <span class="small muted"><sh-icon name="flame" /> {{ m.streak }}</span>
                        </div>
                      </li>
                    }
                  </ol>
                  @if (room.members().length === 1) {
                    <p class="lonely muted">
                      It’s quiet up here. <button type="button" class="linkish" (click)="room.invite()">Invite a friend</button> to climb together.
                    </p>
                  }
                </section>
              </div>

              <section class="feed panel" aria-labelledby="feed-title">
                <h2 id="feed-title"><sh-icon name="bell" /> Activity</h2>
                @if (room.activity().length === 0) {
                  <p class="muted small">No activity yet — be the first to check in.</p>
                } @else {
                  <ul class="feed__list" aria-live="polite">
                    @for (event of room.activity(); track event.id) {
                      <li class="event" @feedItem [attr.data-type]="event.type">
                        <sh-avatar [name]="event.displayName" [hue]="event.avatarHue" [size]="32" />
                        <p>
                          <strong>{{ event.userId === myId() ? 'You' : event.displayName }}</strong>
                          {{ describe(event) }}
                          <time class="muted" [attr.datetime]="event.createdAt">{{ event.createdAt | relativeTime }}</time>
                        </p>
                        <sh-icon class="event__icon" [name]="eventIcon(event)" />
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>
          }
        }
      }
    </div>

    <sh-confirm-dialog
      #confirm
      [heading]="isOwner() ? 'Delete this habit?' : 'Leave this room?'"
      [message]="isOwner() ? 'The habit, its room and everyone’s progress will be removed.' : 'Your progress in this room will be removed. You can rejoin with a new invite.'"
      [confirmLabel]="isOwner() ? 'Delete habit' : 'Leave room'"
    />
  `,
  styleUrl: './room-page.css',
})
export class RoomPage {
  /** Route param, bound by withComponentInputBinding */
  readonly habitId = input.required<string>();

  protected readonly room = inject(RoomStore);
  private readonly habits = inject(HabitsStore);
  private readonly router = inject(Router);
  private readonly particles = inject(ParticleBurstService);

  private readonly confirm = viewChild.required(ConfirmDialogComponent);
  private readonly btn = viewChild('btn', { read: ElementRef });
  private readonly ring = viewChild(ProgressRingComponent, { read: ElementRef });
  private readonly rows = viewChild<ElementRef<HTMLElement>>('rows');

  private readonly habit = computed(() => this.room.habit() ?? EMPTY_HABIT);
  private readonly pending = computed(() => this.habits.pending().has(this.habit().id));
  protected readonly cooldown = injectCooldown(this.habit, this.pending);

  protected readonly myId = computed(() => this.room.me()?.userId ?? null);
  protected readonly isOwner = computed(() => this.habit().shared.role === 'owner');
  protected readonly cooldownText = computed(() => formatDuration(this.habit().cooldownSeconds));
  protected readonly flashUser = signal<string | null>(null);

  protected readonly connectionLabel = computed(() => {
    switch (this.room.connection()) {
      case 'open': return 'Live';
      case 'connecting': return 'Connecting…';
      case 'reconnecting': return 'Reconnecting…';
      case 'offline': return 'Offline';
      default: return 'Paused';
    }
  });

  protected readonly errorTitle = computed(() => {
    switch (this.room.error()?.code) {
      case 'NOT_FOUND': return 'This room doesn’t exist';
      case 'FORBIDDEN': return 'You’re not on this rope team';
      default: return 'Couldn’t open the room';
    }
  });

  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlashSeq = 0;
  private rowRects = new Map<string, DOMRect>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.flashTimer && clearTimeout(this.flashTimer));

    effect(() => {
      const id = this.habitId();
      untracked(() => this.room.open(id));
    });

    // Somebody checked in → highlight their row
    effect(() => {
      const flash = this.room.flash();
      untracked(() => {
        if (!flash || flash.seq === this.lastFlashSeq) return;
        this.lastFlashSeq = flash.seq;
        this.flashUser.set(flash.userId);
        if (this.flashTimer) clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(() => this.flashUser.set(null), FLASH_MS);
      });
    });

    // Leaderboard FLIP: rows glide to their new rank instead of jumping
    afterRenderEffect(() => {
      this.room.members();
      const list = this.rows()?.nativeElement;
      if (!list) return;
      const reduced = prefersReducedMotion();
      const next = new Map<string, DOMRect>();
      const moved: [HTMLElement, number][] = [];
      for (const el of Array.from(list.children) as HTMLElement[]) {
        const id = el.dataset['user'];
        if (!id) continue;
        const rect = el.getBoundingClientRect();
        next.set(id, rect);
        const prev = this.rowRects.get(id);
        if (prev && Math.abs(prev.top - rect.top) > 1) moved.push([el, prev.top - rect.top]);
      }
      this.rowRects = next;
      if (reduced || moved.length === 0) return;
      const { gsap } = useGsap();
      for (const [el, dy] of moved) {
        gsap.fromTo(el, { y: dy }, { y: 0, duration: 0.6, ease: 'power3.out', clearProps: 'transform' });
      }
    });
  }

  protected async checkIn(): Promise<void> {
    if (this.cooldown.phase() !== 'ready') return;
    const h = this.habit();
    const button = this.btn()?.nativeElement as HTMLElement | undefined;
    if (button) this.particles.fromElement(button, { label: `+${h.xpPerCheckIn} XP` });
    if (h.progress.count + 1 >= h.progress.target) {
      const ring = this.ring()?.nativeElement as HTMLElement | undefined;
      if (ring) setTimeout(() => this.particles.fromElement(ring, { kind: 'confetti' }), 180);
    }
    const outcome = await this.room.checkIn();
    if (outcome && !outcome.ok && button && !prefersReducedMotion()) {
      useGsap().gsap.fromTo(button, { x: 0 }, { keyframes: { x: [0, -9, 8, -5, 3, 0] }, duration: 0.45, clearProps: 'transform' });
    }
  }

  protected async leaveOrDelete(): Promise<void> {
    if (!(await this.confirm().ask())) return;
    const id = this.habit().id;
    const ok = this.isOwner() ? await this.habits.remove(id) : await this.room.leave();
    if (ok) void this.router.navigateByUrl('/dashboard');
  }

  protected describe(event: ActivityEvent): string {
    switch (event.type) {
      case 'check_in': {
        const { count, target } = event.meta;
        return count !== undefined && target !== undefined ? `checked in (${count}/${target})` : 'checked in';
      }
      case 'completed': return 'reached the target';
      case 'joined': return 'joined the room';
      case 'left': return 'left the room';
      case 'streak_milestone': return `hit a ${event.meta['streak'] ?? ''}-day streak`;
    }
  }

  protected eventIcon(event: ActivityEvent) {
    switch (event.type) {
      case 'check_in': return 'bolt' as const;
      case 'completed': return 'trophy' as const;
      case 'joined': return 'users' as const;
      case 'left': return 'door' as const;
      case 'streak_milestone': return 'flame' as const;
    }
  }
}
