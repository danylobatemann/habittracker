import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { silentRequest } from '../http/http-context';
import { ApiService } from '../http/api.service';
import type { ChangePasswordRequest, NotificationSettings, UpdateProfileRequest, User } from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly api = inject(ApiService);

  me(): Observable<User> {
    return this.api.get<User>('me');
  }

  update(body: UpdateProfileRequest): Observable<User> {
    return this.api.patch<User>('me', body, { context: silentRequest() });
  }

  changePassword(body: ChangePasswordRequest): Observable<void> {
    return this.api.put<void>('me/password', body, { context: silentRequest() });
  }

  notifications(): Observable<NotificationSettings> {
    return this.api.get<NotificationSettings>('me/notifications');
  }

  updateNotifications(body: NotificationSettings): Observable<NotificationSettings> {
    return this.api.put<NotificationSettings>('me/notifications', body);
  }
}
