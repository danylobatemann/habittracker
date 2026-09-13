import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription, catchError, firstValueFrom, retry, tap, throwError, timer } from 'rxjs';

import { HabitsApi } from '../../../core/api/habits-api.service';
import { ProfileApi } from '../../../core/api/profile-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/api-error';
import type { CheckInResponse, CooldownErrorDetails, CreateHabitRequest, Habit } from '../../../core/models/habit.models';
import type { ServerEvent } from '../../../core/models/realtime.models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { ServerClock } from '../../../core/time/server-clock.service';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type HabitEvent = Exclude<ServerEvent, { type: 'pong' }>;

export type CheckInOutcome =
  | { ok: true; response: CheckInResponse }
  | { ok: false; error: ApiError; reason: 'cooldown' | 'target' | 'failed' };

/** A friend just checked in on one of my shared habits */
export interface FriendPulse {
  habitId: string;
  displayName: string;
  avatarHue: number;
  seq: number;
}

/** Reload the list when the tab returns after this long (period may have rolled over) */
const STALE_AFTER_HIDDEN_MS = 2 * 60_000;

/**
 * Single source of truth for the signed-in user's habits.
 *
 * Check-ins are optimistic: the card updates instantly, the request carries an
 * idempotency key (so the one automatic retry on a network blip can't count
 * twice) and any failure rolls back to the snapshot — unless something newer
 * (a realtime update, another check-in) has replaced the optimistic value in
 * the meantime, in which case that newer value wins.
 */
@Injectable({ providedIn: 'root' })
export class HabitsStore {
  private readonly api = inject(HabitsApi);
  private readonly profileApi = inject(ProfileApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ServerClock);
  private readonly realtime = inject(RealtimeService);
  private readonly doc = inject(DOCUMENT);

  private readonly _habits = signal<Habit[]>([]);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<ApiError | null>(null);
  private readonly _pending = signal<ReadonlySet<string>>(new Set());
  private readonly _friendPulse = signal<FriendPulse | null>(null);

  readonly habits = this._habits.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly friendPulse = this._friendPulse.asReadonly();

  readonly isEmpty = computed(() => this._status() === 'ready' && this._habits().length === 0);
  readonly stats = computed(() => {
    const habits = this._habits();
    const done = habits.filter((h) => h.progress.count >= h.progress.target).length;
    return {
      total: habits.length,
      done,
      percent: habits.length ? Math.round((done / habits.length) * 100) : 0,
      bestStreak: habits.reduce((max, h) => Math.max(max, h.streak.current), 0),
      shared: habits.filter((h) => h.shared.enabled).length,
    };
  });

  private load$: Subscription | null = null;
  /** Seeded with the current user so the first effect run doesn't cancel a load started right after creation */
  private loadedFor: string | null = this.auth.user()?.id ?? null;
  private hiddenAt = 0;
  private pulseSeq = 0;
  private readonly liveSubs = new Map<string, Subscription>();
  private readonly liveRefs = signal(0);

  constructor() {
    // Different account signed in (or signed out) → drop the previous user's data
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => {
        if (userId !== this.loadedFor) this.reset();
        this.loadedFor = userId;
      });
    });

    // Keep one realtime subscription per shared habit while a view wants live updates
    effect(() => {
      const wanted = this.liveRefs() > 0 ? this._habits().filter((h) => h.shared.enabled).map((h) => h.id) : [];
      untracked(() => this.syncLive(new Set(wanted)));
    });

    // Refetch after the socket was down — missed events are not replayed
    effect(() => {
      if (this.realtime.reconnects() > 0) untracked(() => this._status() === 'ready' && this.load(true));
    });

    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'hidden') {
        this.hiddenAt = this.clock.now();
      } else if (this.hiddenAt && this.clock.now() - this.hiddenAt > STALE_AFTER_HIDDEN_MS) {
        this.hiddenAt = 0;
        if (this._status() === 'ready') this.load(true);
      }
    });
  }

  habit(id: string): Habit | undefined {
    return this._habits().find((h) => h.id === id);
  }

  isPending(id: string): boolean {
    return this._pending().has(id);
  }

  /** Loads once; `force` refetches in the background without flashing skeletons */
  load(force = false): void {
    if (this.load$ && !this.load$.closed) return;
    if (!force && this._status() === 'ready') return;

    if (this._status() !== 'ready') this._status.set('loading');
    this._error.set(null);

    this.load$ = this.api.list().subscribe({
      next: (res) => {
        // Don't clobber a check-in that is still in flight
        const pending = this._pending();
        const current = new Map(this._habits().map((h) => [h.id, h]));
        this._habits.set(res.items.map((h) => (pending.has(h.id) ? current.get(h.id) ?? h : h)));
        this._status.set('ready');
      },
      error: (err: unknown) => {
        const error = ApiError.from(err);
        this._error.set(error);
        if (this._status() !== 'ready') this._status.set('error');
      },
    });
  }

  /** Insert or replace a habit coming from elsewhere (room snapshot, realtime) */
  upsert(habit: Habit): void {
    if (this._pending().has(habit.id)) return;
    this._habits.update((list) => {
      const index = list.findIndex((h) => h.id === habit.id);
      if (index === -1) return [...list, habit];
      const next = list.slice();
      next[index] = habit;
      return next;
    });
  }

  removeLocal(id: string): void {
    this._habits.update((list) => list.filter((h) => h.id !== id));
  }

  create(body: CreateHabitRequest): Observable<Habit> {
    return this.api.create(body).pipe(
      tap((habit) => {
        this._habits.update((list) => [habit, ...list]);
        if (this._status() !== 'ready') this._status.set('ready');
      }),
    );
  }

  /** Optimistic delete with rollback to the original position */
  async remove(id: string): Promise<boolean> {
    const list = this._habits();
    const index = list.findIndex((h) => h.id === id);
    if (index === -1) return false;
    const snapshot = list[index];
    this.removeLocal(id);

    try {
      await firstValueFrom(this.api.remove(id));
      return true;
    } catch (err) {
      this._habits.update((current) => {
        if (current.some((h) => h.id === id)) return current;
        const next = current.slice();
        next.splice(Math.min(index, next.length), 0, snapshot);
        return next;
      });
      const error = ApiError.from(err);
      if (!error.isNetwork && !error.isServer) this.toast.error(error.message);
      return false;
    }
  }

  /**
   * Optimistic check-in.
   *
   *   1. snapshot → apply count + 1, the expected cooldown and completion;
   *   2. POST with an idempotency key, one retry on network failure;
   *   3. success → take the server's habit (authoritative counters/cooldown);
   *      failure → roll back and explain in context.
   */
  async checkIn(id: string): Promise<CheckInOutcome> {
    const snapshot = this.habit(id);
    if (!snapshot || this._pending().has(id)) {
      return { ok: false, reason: 'failed', error: new ApiError(0, 'UNKNOWN', 'Check-in already in progress.') };
    }

    const optimistic = applyOptimisticCheckIn(snapshot, this.clock.now());
    this.replace(id, optimistic);
    this.setPending(id, true);

    const key = idempotencyKey();
    try {
      const response = await firstValueFrom(
        this.api.checkIn(id, key).pipe(
          // Same key → the server counts it once even if the first attempt landed
          retry({
            count: 1,
            delay: (err: unknown) => (ApiError.from(err).isNetwork ? timer(900) : throwError(() => err)),
          }),
        ),
      );
      this.setPending(id, false);
      this.replaceIf(id, optimistic, response.habit);
      this.creditXp(response);
      return { ok: true, response };
    } catch (err) {
      this.setPending(id, false);
      const error = ApiError.from(err);
      return this.rollback(id, snapshot, optimistic, error);
    }
  }

  /** While the returned disposer isn't called, shared habits receive realtime updates */
  enableLiveUpdates(): () => void {
    this.liveRefs.update((n) => n + 1);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.liveRefs.update((n) => n - 1);
    };
  }

  // --- internals ---------------------------------------------------------------

  private rollback(id: string, snapshot: Habit, optimistic: Habit, error: ApiError): CheckInOutcome {
    switch (error.code) {
      case 'COOLDOWN_ACTIVE': {
        // The device's idea of the cooldown was wrong (other device, clock drift):
        // show the server's end time instead.
        const details = error.details as Partial<CooldownErrorDetails>;
        if (details.serverTime) this.clock.addPushSample(details.serverTime);
        this.replaceIf(id, optimistic, {
          ...snapshot,
          cooldownEndsAt: details.cooldownEndsAt ?? snapshot.cooldownEndsAt,
        });
        this.toast.info('Still cooling down — the timer is synced with the server.', { key: `cooldown:${id}` });
        return { ok: false, error, reason: 'cooldown' };
      }
      case 'DAILY_TARGET_REACHED':
        this.replaceIf(id, optimistic, snapshot);
        this.toast.info(error.message, { key: `target:${id}` });
        this.load(true);
        return { ok: false, error, reason: 'target' };
      case 'NOT_FOUND':
        this.removeLocal(id);
        this.toast.error('This habit no longer exists.');
        return { ok: false, error, reason: 'failed' };
      default:
        this.replaceIf(id, optimistic, snapshot);
        this.toast.error(
          error.isNetwork ? 'You’re offline — check-in not saved.' : 'Check-in didn’t go through. Nothing was lost.',
          { key: `checkin:${id}`, action: { label: 'Retry', run: () => void this.checkIn(id) } },
        );
        return { ok: false, error, reason: 'failed' };
    }
  }

  private creditXp(res: CheckInResponse): void {
    const user = this.auth.user();
    if (!user) return;

    // Instant feedback from the response, then reconcile with the server's totals
    let { xp, level, xpToNextLevel } = user;
    xp += res.checkIn.xpAwarded;
    while (xp >= xpToNextLevel) {
      xp -= xpToNextLevel;
      level++;
      xpToNextLevel = 100 + (level - 1) * 40;
    }
    this.auth.patchUser({ xp, level, xpToNextLevel });

    this.toast.xp(`+${res.checkIn.xpAwarded} XP${res.completed ? ' · target hit!' : ''}`, { key: 'xp' });
    if (res.levelUp) this.toast.success(`Level up! You reached level ${res.levelUp.level}.`, { key: 'level' });

    this.profileApi
      .me()
      .pipe(catchError(() => []))
      .subscribe((fresh) => this.auth.setUser(fresh));
  }

  private replace(id: string, habit: Habit): void {
    this._habits.update((list) => list.map((h) => (h.id === id ? habit : h)));
  }

  /** Replace only if the habit still is `expected` — newer data must not be overwritten */
  private replaceIf(id: string, expected: Habit, next: Habit): void {
    this._habits.update((list) => list.map((h) => (h.id === id && h === expected ? next : h)));
  }

  private setPending(id: string, on: boolean): void {
    this._pending.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private syncLive(wanted: Set<string>): void {
    for (const [id, sub] of this.liveSubs) {
      if (!wanted.has(id)) {
        sub.unsubscribe();
        this.liveSubs.delete(id);
      }
    }
    for (const id of wanted) {
      if (!this.liveSubs.has(id)) {
        this.liveSubs.set(id, this.realtime.habitEvents(id).subscribe((event) => this.onEvent(event)));
      }
    }
  }

  private onEvent(event: HabitEvent): void {
    const me = this.auth.user()?.id;
    switch (event.type) {
      case 'habit.updated':
        this.upsert(event.habit);
        break;
      case 'member.checked_in':
        if (event.member.userId === me) {
          // Checked in from another tab/device — pull the authoritative habit
          if (!this._pending().has(event.habitId)) this.refreshOne(event.habitId);
        } else {
          this._friendPulse.set({
            habitId: event.habitId,
            displayName: event.member.displayName,
            avatarHue: event.member.avatarHue,
            seq: ++this.pulseSeq,
          });
        }
        break;
      case 'member.joined':
      case 'member.left': {
        const delta = event.type === 'member.joined' ? 1 : -1;
        if (event.type === 'member.left' && event.userId === me) {
          this.removeLocal(event.habitId);
          break;
        }
        const habit = this.habit(event.habitId);
        if (habit) {
          this.replace(habit.id, {
            ...habit,
            shared: { ...habit.shared, membersCount: Math.max(1, habit.shared.membersCount + delta) },
          });
        }
        break;
      }
    }
  }

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced — several events in a burst cause one request */
  private refreshOne(_habitId: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.load(true);
    }, 400);
  }

  private reset(): void {
    this.load$?.unsubscribe();
    this.load$ = null;
    this.syncLive(new Set());
    this._habits.set([]);
    this._pending.set(new Set());
    this._status.set('idle');
    this._error.set(null);
  }
}

/** What the server is expected to return for a successful check-in */
export function applyOptimisticCheckIn(habit: Habit, nowMs: number): Habit {
  const count = Math.min(habit.progress.target, habit.progress.count + 1);
  const completed = count >= habit.progress.target;
  const nowIso = new Date(nowMs).toISOString();
  return {
    ...habit,
    progress: {
      ...habit.progress,
      count,
      completedAt: completed ? nowIso : habit.progress.completedAt,
    },
    lastCheckInAt: nowIso,
    cooldownEndsAt:
      !completed && habit.cooldownSeconds > 0 ? new Date(nowMs + habit.cooldownSeconds * 1000).toISOString() : null,
    // Completing the period for the first time extends the streak
    streak:
      completed && habit.progress.completedAt === null
        ? {
            ...habit.streak,
            current: habit.streak.current + 1,
            best: Math.max(habit.streak.best, habit.streak.current + 1),
          }
        : habit.streak,
  };
}

/** `crypto.randomUUID` only exists on https/localhost — not when a phone opens the dev server by LAN IP */
function idempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
