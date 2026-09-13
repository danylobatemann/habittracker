import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';

import { ApiService } from '../http/api.service';
import { publicRequest } from '../http/http-context';
import type { WithServerTime } from '../models/api.models';
import { ServerClock, monotonic } from './server-clock.service';

const RESYNC_INTERVAL_MS = 5 * 60_000;
/** A gap this much bigger than the timer interval means the device slept */
const SLEEP_DETECT_SLACK_MS = 30_000;

/**
 * Keeps ServerClock honest:
 *   • a few `GET /time` samples at startup (best RTT wins);
 *   • resync when the tab becomes visible or the network comes back;
 *   • resync after sleep — some browsers pause performance.now() while the
 *     machine is suspended, which would freeze countdowns in the past.
 */
@Injectable({ providedIn: 'root' })
export class ClockSync {
  private readonly api = inject(ApiService);
  private readonly clock = inject(ServerClock);
  private readonly doc = inject(DOCUMENT);
  private started = false;

  start(destroyRef: DestroyRef): void {
    if (this.started) return;
    this.started = true;

    void this.burst();

    const onVisible = () => {
      if (this.doc.visibilityState === 'visible') void this.sync();
    };
    const onOnline = () => void this.sync();
    this.doc.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    let lastTick = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastTick > RESYNC_INTERVAL_MS + SLEEP_DETECT_SLACK_MS) this.clock.invalidate();
      lastTick = now;
      void this.sync();
    }, RESYNC_INTERVAL_MS);

    destroyRef.onDestroy(() => {
      this.doc.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
      this.started = false;
    });
  }

  /** Three quick samples: the fastest round-trip gives the tightest offset */
  private async burst(): Promise<void> {
    for (let i = 0; i < 3; i++) await this.sync();
  }

  private sync(): Promise<void> {
    const sentAt = monotonic();
    return new Promise((resolve) => {
      this.api.get<WithServerTime>('time', { context: publicRequest() }).subscribe({
        next: (res) => {
          // The interceptor already recorded the header sample; the body is a
          // fallback for deployments that don't expose X-Server-Time
          // cross-origin. A duplicate sample is harmless (lowest RTT wins).
          this.clock.addSample(Date.parse(res.serverTime), sentAt, monotonic());
          resolve();
        },
        error: () => resolve(),
      });
    });
  }
}
