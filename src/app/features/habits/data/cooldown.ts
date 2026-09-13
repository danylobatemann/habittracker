import { DestroyRef, type Signal, computed, effect, inject, signal, untracked } from '@angular/core';

import type { Habit } from '../../../core/models/habit.models';
import { ServerClock } from '../../../core/time/server-clock.service';
import { formatCountdown } from '../../../shared/utils/time-format';

export type CooldownPhase = 'ready' | 'pending' | 'cooldown' | 'completed';

export interface Cooldown {
  phase: Signal<CooldownPhase>;
  /** ms left, server time based */
  remainingMs: Signal<number>;
  /** 1 → just started, 0 → ready */
  fraction: Signal<number>;
  /** "4:59" */
  label: Signal<string>;
  /** Increments every time a running cooldown finishes — drive a "ready" pulse from it */
  readyTicks: Signal<number>;
}

const TICK_MS = 250;

/**
 * Cooldown state machine for one habit card.
 *
 *   completed  target reached for the period (no more check-ins)
 *   pending    check-in request in flight
 *   cooldown   server's `cooldownEndsAt` is still ahead of *server* now
 *   ready      can check in
 *
 * Time comes from ServerClock (monotonic + server offset), so moving the
 * device clock forward doesn't unlock the button — and even if the UI were
 * tricked, the backend answers COOLDOWN_ACTIVE and the store rolls back.
 *
 * The interval only runs while a cooldown is active; a re-sync of the clock
 * offset (tab woke up, network changed) re-evaluates immediately.
 *
 * Must be called in an injection context (component field initializer).
 */
export function injectCooldown(habit: Signal<Habit>, pending: Signal<boolean>): Cooldown {
  const clock = inject(ServerClock);
  const destroyRef = inject(DestroyRef);

  const now = signal(clock.now());
  const readyTicks = signal(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  const endsAtMs = computed(() => {
    const iso = habit().cooldownEndsAt;
    return iso ? Date.parse(iso) : 0;
  });

  const remainingMs = computed(() => Math.max(0, endsAtMs() - now()));

  const phase = computed<CooldownPhase>(() => {
    const { count, target } = habit().progress;
    if (count >= target) return 'completed';
    if (pending()) return 'pending';
    return remainingMs() > 0 ? 'cooldown' : 'ready';
  });

  const fraction = computed(() => {
    const total = habit().cooldownSeconds * 1000;
    return total > 0 ? Math.min(1, remainingMs() / total) : 0;
  });

  const label = computed(() => formatCountdown(remainingMs()));

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  effect(() => {
    const end = endsAtMs();
    clock.offsetMs(); // re-run when the server offset is corrected
    untracked(() => {
      now.set(clock.now());
      if (end <= now()) {
        stop();
        return;
      }
      timer ??= setInterval(() => {
        const t = clock.now();
        now.set(t);
        if (t >= endsAtMs()) {
          stop();
          readyTicks.update((n) => n + 1);
        }
      }, TICK_MS);
    });
  });

  destroyRef.onDestroy(stop);

  return { phase, remainingMs, fraction, label, readyTicks: readyTicks.asReadonly() };
}
