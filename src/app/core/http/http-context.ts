import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Do not attach the bearer token and never try to refresh (login, register, refresh itself) */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/** The caller renders its own error UI — the global error interceptor must not toast */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

/** Internal: the request is already a retry after a token refresh */
export const IS_AUTH_RETRY = new HttpContextToken<boolean>(() => false);

export function publicRequest(): HttpContext {
  return new HttpContext().set(SKIP_AUTH, true).set(SILENT_ERRORS, true);
}

export function silentRequest(): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, true);
}
