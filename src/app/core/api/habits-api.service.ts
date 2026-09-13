import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { silentRequest } from '../http/http-context';
import { ApiService } from '../http/api.service';
import type { CheckInResponse, CreateHabitRequest, Habit, HabitListResponse } from '../models/habit.models';

@Injectable({ providedIn: 'root' })
export class HabitsApi {
  private readonly api = inject(ApiService);

  list(): Observable<HabitListResponse> {
    return this.api.get<HabitListResponse>('habits');
  }

  create(body: CreateHabitRequest): Observable<Habit> {
    return this.api.post<Habit>('habits', body, { context: silentRequest() });
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`habits/${encodeURIComponent(id)}`);
  }

  /**
   * The server is the only authority on cooldowns: it answers 429
   * COOLDOWN_ACTIVE with `details.cooldownEndsAt` if the gap hasn't passed.
   * `idempotencyKey` makes a retried request (flaky network) count once.
   * Errors are silent — HabitsStore rolls back and explains them in context.
   */
  checkIn(id: string, idempotencyKey: string): Observable<CheckInResponse> {
    return this.api.post<CheckInResponse>(`habits/${encodeURIComponent(id)}/check-ins`, null, {
      headers: { 'Idempotency-Key': idempotencyKey },
      context: silentRequest(),
    });
  }
}
