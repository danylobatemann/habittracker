import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { serverTimeInterceptor } from './core/http/server-time.interceptor';
import { mockInterceptors, mockProviders } from './core/mock/mock.providers';
import { routes } from './app.routes';

/**
 * Zoneless (Angular 22 default): all state is signals, so no zone.js.
 *
 * Interceptor order matters — requests flow top → bottom, responses bottom → top:
 *   errorInterceptor       outermost: sees the final result, maps to ApiError, toasts globals
 *   authInterceptor        attaches the bearer token, refreshes once on 401 and retries
 *   serverTimeInterceptor  feeds X-Server-Time samples into ServerClock
 *   mockInterceptors       dev/demo only: answers in-browser (empty in production)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([errorInterceptor, authInterceptor, serverTimeInterceptor, ...mockInterceptors]),
    ),
    provideAnimationsAsync(),
    ...mockProviders,
  ],
};
