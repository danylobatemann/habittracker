import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { silentRequest } from '../http/http-context';
import { ApiService } from '../http/api.service';
import type { AcceptInviteResponse, HabitRoom, InvitePreview, InviteResponse } from '../models/room.models';

@Injectable({ providedIn: 'root' })
export class RoomsApi {
  private readonly api = inject(ApiService);

  room(habitId: string): Observable<HabitRoom> {
    return this.api.get<HabitRoom>(`rooms/${encodeURIComponent(habitId)}`, { context: silentRequest() });
  }

  createInvite(habitId: string): Observable<InviteResponse> {
    return this.api.post<InviteResponse>(`habits/${encodeURIComponent(habitId)}/invites`);
  }

  /** Preview is readable while signed in only — the invite page sits behind authGuard */
  previewInvite(token: string): Observable<InvitePreview> {
    return this.api.get<InvitePreview>(`invites/${encodeURIComponent(token)}`, { context: silentRequest() });
  }

  acceptInvite(token: string): Observable<AcceptInviteResponse> {
    return this.api.post<AcceptInviteResponse>(`invites/${encodeURIComponent(token)}/accept`, null, {
      context: silentRequest(),
    });
  }

  leave(habitId: string): Observable<void> {
    return this.api.delete(`rooms/${encodeURIComponent(habitId)}/members/me`);
  }
}
