import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { publicRequest, silentRequest } from '../http/http-context';
import { ApiService } from '../http/api.service';
import type { AuthResponse, AuthTokens, LoginRequest, RegisterRequest } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiService);

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('auth/login', body, { context: publicRequest() });
  }

  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('auth/register', body, { context: publicRequest() });
  }

  refresh(refreshToken: string): Observable<AuthTokens> {
    return this.api.post<AuthTokens>('auth/refresh', { refreshToken }, { context: publicRequest() });
  }

  logout(refreshToken: string): Observable<void> {
    return this.api.post<void>('auth/logout', { refreshToken }, { context: silentRequest() });
  }
}
