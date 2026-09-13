import { Injectable, computed, signal } from '@angular/core';

interface ClockSample {
  offsetMs: number;
  rttMs: number;
  at: number;
}

const MAX_SAMPLES = 8;
/** Samples older than this are ignored when picking the best one (clock drift) */
const SAMPLE_TTL_MS = 10 * 60_000;

/**
 * Server-authoritative clock.
 *
 * Why: cooldowns must not be skippable by changing the device time. We never
 * read `Date.now()` for anything the server enforces. Instead:
 *
 *   monotonic = performance.timeOrigin + performance.now()
 *     — keeps ticking at a steady rate and ignores wall-clock changes made
 *       after the page loaded;
 *   offset    = serverTime − monotonic at the midpoint of the request
 *     — NTP-style estimate; the sample with the lowest round-trip wins
 *       because it has the smallest error bound (±rtt/2).
 *
 * `now()` = monotonic + offset ≈ the server's clock, whatever the device says.
 * The worst a tampered device can do is show a wrong countdown — the backend
 * still rejects early check-ins with COOLDOWN_ACTIVE.
 */
@Injectable({ providedIn: 'root' })
export class ServerClock {
  private samples: ClockSample[] = [];
  private readonly _offsetMs = signal(0);
  private readonly _synced = signal(false);

  readonly offsetMs = this._offsetMs.asReadonly();
  readonly synced = this._synced.asReadonly();
  /** Device clock is more than a minute off — worth telling the user */
  readonly deviceClockSkewed = computed(
    () => this._synced() && Math.abs(this._offsetMs() + this.wallVsMonotonic()) > 60_000,
  );

  /** Current server time, epoch ms */
  now(): number {
    return monotonic() + this._offsetMs();
  }

  /** Milliseconds from server-now until `iso` (negative when in the past) */
  msUntil(iso: string | null): number {
    if (!iso) return 0;
    return Date.parse(iso) - this.now();
  }

  /**
   * Feed a server timestamp observed on a response.
   * @param serverEpochMs server time when the response was produced
   * @param sentAt        monotonic() when the request left
   * @param receivedAt    monotonic() when the response arrived
   */
  addSample(serverEpochMs: number, sentAt: number, receivedAt: number): void {
    if (!Number.isFinite(serverEpochMs)) return;
    const rttMs = Math.max(0, receivedAt - sentAt);
    const offsetMs = serverEpochMs - (sentAt + rttMs / 2);

    this.samples = [...this.samples, { offsetMs, rttMs, at: receivedAt }].slice(-MAX_SAMPLES);
    this.recompute(receivedAt);
  }

  /** Server time delivered without round-trip info (e.g. a realtime event) — low confidence */
  addPushSample(serverIso: string): void {
    const at = monotonic();
    // Treat push latency as an unknown ~250 ms RTT so request samples win when available
    this.addSample(Date.parse(serverIso), at - 250, at);
  }

  /** Drop samples, e.g. after the machine woke from sleep (performance.now may have paused) */
  invalidate(): void {
    this.samples = [];
    this._synced.set(false);
  }

  private recompute(now: number): void {
    const fresh = this.samples.filter((s) => now - s.at < SAMPLE_TTL_MS);
    if (fresh.length === 0) return;
    const best = fresh.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
    this._offsetMs.set(best.offsetMs);
    this._synced.set(true);
  }

  private wallVsMonotonic(): number {
    return monotonic() - Date.now();
  }
}

export function monotonic(): number {
  return performance.timeOrigin + performance.now();
}
