import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';

import { RoomsApi } from '../../../core/api/rooms-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/api-error';
import type { ServerEvent } from '../../../core/models/realtime.models';
import type { ActivityEvent, HabitRoom, RoomMember } from '../../../core/models/room.models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { HabitsStore } from '../../habits/data/habits.store';

type HabitEvent = Exclude<ServerEvent, { type: 'pong' }>;

const ACTIVITY_CAP = 40;

export interface RankedMember extends RoomMember {
  rank: number;
  isMe: boolean;
  percent: number;
}

/**
 * State of one Habit Room. Provided by the room page, so it lives exactly as
 * long as the page.
 *
 * My own row is overlaid from HabitsStore, which means an optimistic check-in
 * moves me up the leaderboard instantly (and back down on rollback) — the
 * realtime echo from the server then confirms it.
 */
@Injectable()
export class RoomStore {
  private readonly api = inject(RoomsApi);
  private readonly auth = inject(AuthService);
  private readonly habits = inject(HabitsStore);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);

  private readonly _room = signal<HabitRoom | null>(null);
  private readonly _status = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly _error = signal<ApiError | null>(null);
  private readonly _flash = signal<{ userId: string; seq: number } | null>(null);
  private readonly _inviteBusy = signal(false);

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly flash = this._flash.asReadonly();
  readonly inviteBusy = this._inviteBusy.asReadonly();
  readonly connection = this.realtime.state;

  private habitId: string | null = null;
  private events: Subscription | null = null;
  private flashSeq = 0;

  /** Habit as the current user sees it — HabitsStore is authoritative (optimistic updates) */
  readonly habit = computed(() => {
    const room = this._room();
    if (!room) return null;
    return this.habits.habits().find((h) => h.id === room.habit.id) ?? room.habit;
  });

  readonly members = computed<RankedMember[]>(() => {
    const room = this._room();
    const habit = this.habit();
    if (!room || !habit) return [];
    const me = this.auth.user()?.id;

    const rows = room.members.map((m) =>
      m.userId === me
        ? { ...m, count: habit.progress.count, streak: habit.streak.current, lastCheckInAt: habit.lastCheckInAt }
        : m,
    );
    rows.sort(
      (a, b) =>
        b.count - a.count ||
        b.streak - a.streak ||
        b.totalCheckIns - a.totalCheckIns ||
        a.displayName.localeCompare(b.displayName),
    );

    let rank = 0;
    let prev: RoomMember | null = null;
    return rows.map((m) => {
      // Shared rank for ties on the visible stats
      if (!prev || prev.count !== m.count || prev.streak !== m.streak) rank++;
      prev = m;
      return { ...m, rank, isMe: m.userId === me, percent: m.target ? Math.round((m.count / m.target) * 100) : 0 };
    });
  });

  readonly me = computed(() => this.members().find((m) => m.isMe) ?? null);
  readonly onlineCount = computed(() => this.members().filter((m) => m.online || m.isMe).length);
  readonly activity = computed<ActivityEvent[]>(() => this._room()?.activity ?? []);

  readonly team = computed(() => {
    const room = this._room();
    const habit = this.habit();
    if (!room || !habit) return { count: 0, target: 0, percent: 0 };
    const serverMe = room.members.find((m) => m.userId === this.auth.user()?.id);
    const count = room.team.count - (serverMe?.count ?? 0) + (serverMe ? habit.progress.count : 0);
    return { count, target: room.team.target, percent: room.team.target ? Math.min(100, Math.round((count / room.team.target) * 100)) : 0 };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.events?.unsubscribe());

    effect(() => {
      if (this.realtime.reconnects() > 0) untracked(() => this.refresh());
    });
  }

  open(habitId: string): void {
    if (this.habitId === habitId) return;
    this.habitId = habitId;
    this.events?.unsubscribe();
    this._room.set(null);
    this._status.set('loading');
    this._error.set(null);

    // Subscribe before fetching so nothing is missed between snapshot and stream
    this.events = this.realtime.habitEvents(habitId).subscribe((e) => this.apply(e));
    this.refresh();
  }

  refresh(): void {
    const id = this.habitId;
    if (!id) return;
    this.api.room(id).subscribe({
      next: (room) => {
        if (this.habitId !== id) return;
        this._room.set(room);
        this.habits.upsert(room.habit);
        this._status.set('ready');
      },
      error: (err: unknown) => {
        if (this.habitId !== id) return;
        this._error.set(ApiError.from(err));
        if (!this._room()) this._status.set('error');
      },
    });
  }

  checkIn() {
    const habit = this.habit();
    return habit ? this.habits.checkIn(habit.id) : Promise.resolve(null);
  }

  /** Creates an invite and shares it (native share sheet on mobile, clipboard elsewhere) */
  async invite(): Promise<void> {
    const habit = this.habit();
    if (!habit || this._inviteBusy()) return;
    this._inviteBusy.set(true);
    try {
      const { url } = await firstValueFrom(this.api.createInvite(habit.id));
      const shareData = { title: `Join “${habit.title}” on SyncHabit`, url };
      if (navigator.share && navigator.canShare?.(shareData) && matchMedia('(pointer: coarse)').matches) {
        await navigator.share(shareData).catch(() => undefined);
      } else if (await copyText(url)) {
        this.toast.success('Invite link copied — send it to a friend.', { key: 'invite' });
      } else {
        this.toast.info(url, { key: 'invite', durationMs: 12_000 });
      }
    } catch {
      /* errorInterceptor already toasted */
    } finally {
      this._inviteBusy.set(false);
    }
  }

  async leave(): Promise<boolean> {
    const habit = this.habit();
    if (!habit) return false;
    try {
      await firstValueFrom(this.api.leave(habit.id));
      this.habits.removeLocal(habit.id);
      this.toast.info(`You left “${habit.title}”.`);
      return true;
    } catch (err) {
      const error = ApiError.from(err);
      if (!error.isNetwork && !error.isServer) this.toast.error(error.message);
      return false;
    }
  }

  // --- realtime ------------------------------------------------------------------

  private apply(event: HabitEvent): void {
    const room = this._room();
    if (!room) return; // the snapshot that is loading already contains it

    switch (event.type) {
      case 'member.checked_in':
        this._room.set({
          ...room,
          members: upsertMember(room.members, event.member),
          activity: prependActivity(room.activity, event.activity),
          team: event.team,
        });
        this._flash.set({ userId: event.member.userId, seq: ++this.flashSeq });
        break;
      case 'member.joined':
        this._room.set({
          ...room,
          members: upsertMember(room.members, event.member),
          activity: prependActivity(room.activity, event.activity),
          team: { ...room.team, target: room.team.target + event.member.target },
        });
        break;
      case 'member.left': {
        const leaving = room.members.find((m) => m.userId === event.userId);
        this._room.set({
          ...room,
          members: room.members.filter((m) => m.userId !== event.userId),
          activity: prependActivity(room.activity, event.activity),
          team: leaving
            ? { count: room.team.count - leaving.count, target: room.team.target - leaving.target }
            : room.team,
        });
        break;
      }
      case 'member.presence':
        this._room.set({
          ...room,
          members: room.members.map((m) => (m.userId === event.userId ? { ...m, online: event.online } : m)),
        });
        break;
      case 'habit.updated':
        this._room.set({ ...room, habit: event.habit });
        this.habits.upsert(event.habit);
        break;
    }
  }
}

function upsertMember(list: RoomMember[], member: RoomMember): RoomMember[] {
  const index = list.findIndex((m) => m.userId === member.userId);
  if (index === -1) return [...list, member];
  const next = list.slice();
  next[index] = member;
  return next;
}

/** Dedupe by id (echo of a snapshot event), newest first, capped */
function prependActivity(list: ActivityEvent[], event: ActivityEvent): ActivityEvent[] {
  if (list.some((a) => a.id === event.id)) return list;
  return [event, ...list].slice(0, ACTIVITY_CAP);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
