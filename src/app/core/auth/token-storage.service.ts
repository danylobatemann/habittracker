import { Injectable } from '@angular/core';

import type { AuthTokens } from '../models/auth.models';
import { monotonic } from '../time/server-clock.service';

const REFRESH_KEY = 'synchabit.refresh';
const REMEMBER_KEY = 'synchabit.remember';

/**
 * Token persistence.
 *
 * • The access token lives in memory only — it is short-lived and never
 *   touches storage, so an XSS dump of localStorage doesn't yield it.
 * • The refresh token is kept in localStorage ("remember me") or
 *   sessionStorage. A real deployment should prefer an httpOnly cookie; the
 *   service is the single place to swap that in.
 * • Expiry is tracked on the monotonic clock, so a device-time change can't
 *   make an expired token look valid (the server would reject it anyway).
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;

  get access(): string | null {
    return this.accessToken;
  }

  get refresh(): string | null {
    return safe(() => localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY));
  }

  /** Access token expires within `skewMs` — refresh proactively */
  isAccessExpiring(skewMs = 20_000): boolean {
    return !this.accessToken || monotonic() + skewMs >= this.accessExpiresAt;
  }

  save(tokens: AuthTokens, remember = this.remembered): void {
    this.accessToken = tokens.accessToken;
    this.accessExpiresAt = monotonic() + tokens.expiresIn * 1000;
    safe(() => {
      localStorage.setItem(REMEMBER_KEY, String(remember));
      localStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
      (remember ? localStorage : sessionStorage).setItem(REFRESH_KEY, tokens.refreshToken);
    });
  }

  /** The server rejected the access token (e.g. socket closed with 4401) — force a refresh next time */
  markAccessExpired(): void {
    this.accessExpiresAt = 0;
  }

  clear(): void {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    safe(() => {
      localStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
    });
  }

  private get remembered(): boolean {
    return safe(() => localStorage.getItem(REMEMBER_KEY) !== 'false') ?? true;
  }
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
