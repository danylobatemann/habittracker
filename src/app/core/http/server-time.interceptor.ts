import { HttpErrorResponse, type HttpHeaders, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { ServerClock, monotonic } from '../time/server-clock.service';

export const SERVER_TIME_HEADER = 'X-Server-Time';

/**
 * Feeds ServerClock from the `X-Server-Time: <epoch ms>` header present on
 * every API response (errors included). The interceptor sits closest to the
 * network so the measured round-trip is as tight as possible.
 *
 * Cross-origin deployments must list the header in
 * `Access-Control-Expose-Headers`; responses without it are simply ignored
 * (payload `serverTime` fields are a second source, see HabitsStore).
 */
export const serverTimeInterceptor: HttpInterceptorFn = (req, next) => {
  const clock = inject(ServerClock);
  const sentAt = monotonic();

  const record = (headers: HttpHeaders) => {
    const raw = headers.get(SERVER_TIME_HEADER);
    if (raw) clock.addSample(Number(raw), sentAt, monotonic());
  };

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) record(event.headers);
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse) record(err.headers);
      },
    }),
  );
};
