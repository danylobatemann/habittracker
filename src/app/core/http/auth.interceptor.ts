import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { TokenStorage } from '../auth/token-storage.service';
import { ApiService } from './api.service';
import { IS_AUTH_RETRY, SKIP_AUTH } from './http-context';

/**
 * JWT handling.
 *
 *  1. Attach `Authorization: Bearer <access>` to API requests.
 *  2. If the access token is about to expire, refresh *before* sending
 *     (saves a guaranteed 401 round-trip).
 *  3. On 401 refresh once — concurrent failures share a single refresh
 *     request (AuthService.refreshTokens is single-flight) — and replay the
 *     original request with the new token. A second 401 is final.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(ApiService);
  const auth = inject(AuthService);
  const tokens = inject(TokenStorage);

  if (req.context.get(SKIP_AUTH) || !api.isApiUrl(req.url)) return next(req);

  const withToken = (r: HttpRequest<unknown>) => {
    const access = tokens.access;
    return access ? r.clone({ setHeaders: { Authorization: `Bearer ${access}` } }) : r;
  };

  const send$ = defer(() =>
    tokens.isAccessExpiring() && tokens.refresh
      ? auth.refreshTokens().pipe(switchMap(() => next(withToken(req))))
      : next(withToken(req)),
  );

  return send$.pipe(
    catchError((err: unknown) => {
      const unauthorized = err instanceof HttpErrorResponse && err.status === 401;
      if (!unauthorized || req.context.get(IS_AUTH_RETRY) || !tokens.refresh) {
        if (unauthorized) auth.expireSession();
        return throwError(() => err);
      }

      const retry = req.clone({ context: req.context.set(IS_AUTH_RETRY, true) });
      return auth.refreshTokens().pipe(
        switchMap(() => next(withToken(retry))),
        catchError((retryErr: unknown) => {
          if (retryErr instanceof HttpErrorResponse && retryErr.status === 401) auth.expireSession();
          return throwError(() => retryErr);
        }),
      );
    }),
  );
};
