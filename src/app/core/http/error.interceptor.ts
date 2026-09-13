import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { ToastService } from '../services/toast.service';
import { ApiError } from './api-error';
import { SILENT_ERRORS } from './http-context';

/**
 * Global error handling — the outermost interceptor.
 *
 * Every failure leaves HttpClient as a typed `ApiError`, so features switch
 * on `error.code` instead of parsing responses. Errors that no screen can
 * handle meaningfully (offline, 5xx, 403, rate limit) are toasted here once;
 * business errors (validation, cooldown, invite expired…) are left to the
 * feature that knows how to present them.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toasts = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      const error = ApiError.from(err);
      const global =
        error.isNetwork || error.isServer || error.code === 'FORBIDDEN' || error.code === 'RATE_LIMITED';

      if (global && !req.context.get(SILENT_ERRORS)) {
        toasts.error(error.message, { key: `http:${error.code}` });
      }
      return throwError(() => error);
    }),
  );
};
