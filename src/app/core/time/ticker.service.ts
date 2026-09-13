import { Injectable, inject, signal } from '@angular/core';

import { ServerClock } from './server-clock.service';

/**
 * Low-frequency shared clock for relative labels ("3 min ago").
 * One interval for the whole app instead of one per list item.
 */
@Injectable({ providedIn: 'root' })
export class Ticker {
  private readonly clock = inject(ServerClock);
  private readonly _now = signal(this.clock.now());

  /** Server time, refreshed every 15 s */
  readonly now = this._now.asReadonly();

  constructor() {
    setInterval(() => this._now.set(this.clock.now()), 15_000);
  }
}
