import { Pipe, type PipeTransform, inject } from '@angular/core';

import { Ticker } from '../../core/time/ticker.service';
import { formatRelative } from '../utils/time-format';

/**
 * `{{ event.createdAt | relativeTime }}` → "3 min ago".
 * Impure on purpose: it reads the Ticker signal, so labels refresh every 15 s
 * without each row owning a timer.
 */
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly ticker = inject(Ticker);

  transform(iso: string | null | undefined): string {
    return formatRelative(iso ?? null, this.ticker.now());
  }
}
