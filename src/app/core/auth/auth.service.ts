import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap, throwError } from 'rxjs';

import { ApiError } from '../http/api-error';
import type { AuthResponse, AuthTokens, LoginRequest, RegisterRequest } from '../models/auth.models';
import type { User } from '../models/user.models';
import { AuthApi } from './auth-api.service';
import { TokenStorage } from './token-storage.service';
import { ProfileApi } from '../api/profile-api.service';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Session state. Components read `user()` / `isAuthenticated()` and call
 * `login` / `register` / `logout`; interceptors call `refreshTokens()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApi);
  private readonly profileApi = inject(ProfileApi);
  private readonly tokens = inject(TokenStorage);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  private readonly _status = signal<AuthStatus>('unknown');

  readonly user = this._user.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  /** In-flight refresh, shared by every request that hit a 401 at the same time */
  private refresh$: Observable<AuthTokens> | null = null;
  private restorePromise: Promise<boolean> | null = null;

  /**
   * Restore a session from the stored refresh token. Guards await this, so
   * the first navigation never flashes the login page for a logged-in user.
   */
  restoreSession(): Promise<boolean> {
    if (this._status() !== 'unknown') return Promise.resolve(this.isAuthenticated());
    if (!this.tokens.refresh) {
      this._status.set('anonymous');
      return Promise.resolve(false);
    }
    this.restorePromise ??= firstValueFrom(
      this.refreshTokens().pipe(
        // `me` goes through the interceptor, which now has a fresh access token
        map(() => true),
        catchError(() => of(false)),
      ),
    ).then(async (ok) => {
      if (!ok) {
        this.dropSession();
        return false;
      }
      try {
        this._user.set(await firstValueFrom(this.profileApi.me()));
        this._status.set('authenticated');
        return true;
      } catch {
        this.dropSession();
        return false;
      } finally {
        this.restorePromise = null;
      }
    });
    return this.restorePromise;
  }

  login(body: LoginRequest, remember: boolean): Observable<User> {
    return this.authApi.login(body).pipe(map((res) => this.startSession(res, remember)));
  }

  register(body: RegisterRequest): Observable<User> {
    return this.authApi.register(body).pipe(map((res) => this.startSession(res, true)));
  }

  /**
   * Single-flight token refresh. Concurrent callers share one request; a
   * failed refresh ends the session.
   */
  refreshTokens(): Observable<AuthTokens> {
    const refreshToken = this.tokens.refresh;
    if (!refreshToken) {
      return throwError(() => new ApiError(401, 'TOKEN_INVALID', 'Your session has ended. Please sign in again.'));
    }

    this.refresh$ ??= this.authApi.refresh(refreshToken).pipe(
      tap((tokens) => this.tokens.save(tokens)),
      catchError((err: unknown) => {
        const error = ApiError.from(err);
        // Network blips shouldn't log the user out — only a rejected token does
        if (!error.isNetwork) this.expireSession();
        return throwError(() => error);
      }),
      finalize(() => (this.refresh$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refresh$;
  }

  logout(): void {
    const refreshToken = this.tokens.refresh;
    if (refreshToken) this.authApi.logout(refreshToken).subscribe({ error: () => undefined });
    this.dropSession();
    void this.router.navigateByUrl('/login');
  }

  /** Server rejected our refresh token: end the session and bounce to login, keeping the target URL */
  expireSession(): void {
    const wasAuthenticated = this.isAuthenticated();
    this.dropSession();
    if (wasAuthenticated) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url, reason: 'expired' },
      });
    }
  }

  /** Local user patch after profile updates / XP gains */
  patchUser(patch: Partial<User>): void {
    this._user.update((u) => (u ? { ...u, ...patch } : u));
  }

  setUser(user: User): void {
    this._user.set(user);
  }

  private startSession(res: AuthResponse, remember: boolean): User {
    this.tokens.save(res.tokens, remember);
    this._user.set(res.user);
    this._status.set('authenticated');
    return res.user;
  }

  private dropSession(): void {
    this.tokens.clear();
    this._user.set(null);
    this._status.set('anonymous');
  }
}
