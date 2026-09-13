import {
  HttpErrorResponse,
  HttpHeaders,
  type HttpInterceptorFn,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SERVER_TIME_HEADER } from '../http/server-time.interceptor';
import { mockHub } from './mock-realtime';
import { MockHttpError, mockServer } from './mock-server';

type Handler = (ctx: { req: HttpRequest<unknown>; params: string[]; userId: () => string; body: any }) => unknown;

/**
 * Routes API calls to MockServer instead of the network. Registered as the
 * innermost interceptor, so the auth / error / clock interceptors run exactly
 * as they would against a real backend.
 *
 * Chaos testing: `localStorage.setItem('synchabit.mock.chaos', '0.3')` makes
 * 30 % of check-ins fail with 503 — handy to watch optimistic rollback.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const server = mockServer();
  const path = req.url.slice(environment.apiUrl.length).split('?')[0].replace(/\/+$/, '');
  const route = ROUTES.find((r) => r.method === req.method && r.pattern.test(path));

  return new Observable<HttpResponse<unknown>>((subscriber) => {
    const latency = route?.fast ? 40 + Math.random() * 60 : 220 + Math.random() * 480;

    const timer = setTimeout(() => {
      const headers = () => new HttpHeaders({ [SERVER_TIME_HEADER]: String(server.now()) });
      try {
        if (!route) throw new MockHttpError(404, { error: { code: 'NOT_FOUND', message: `No mock route for ${req.method} ${path}` } });
        if (route.chaos && Math.random() < chaosRate()) {
          throw new MockHttpError(503, { error: { code: 'UNKNOWN', message: 'The server is busy. Your check-in wasn’t saved.' } });
        }
        const params = route.pattern.exec(path)!.slice(1).map(decodeURIComponent);
        const body = route.handler({
          req,
          params,
          body: req.body ?? {},
          userId: () => server.authenticate(req.headers.get('Authorization')),
        });
        subscriber.next(new HttpResponse({ status: body === undefined ? 204 : 200, body: body ?? null, headers: headers(), url: req.url }));
        subscriber.complete();
      } catch (err) {
        if (err instanceof MockHttpError) {
          subscriber.error(
            new HttpErrorResponse({ status: err.status, error: err.body, headers: headers(), url: req.url }),
          );
        } else {
          console.error('[mock backend]', err);
          subscriber.error(
            new HttpErrorResponse({
              status: 500,
              error: { error: { code: 'UNKNOWN', message: 'Mock server crashed.' } },
              headers: headers(),
              url: req.url,
            }),
          );
        }
      }
    }, latency);

    return () => clearTimeout(timer);
  });
};

function chaosRate(): number {
  try {
    return Math.min(1, Math.max(0, Number(localStorage.getItem('synchabit.mock.chaos')) || 0));
  } catch {
    return 0;
  }
}

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  fast?: boolean;
  chaos?: boolean;
}

const s = mockServer;

const ROUTES: Route[] = [
  { method: 'GET', pattern: /^\/time$/, fast: true, handler: () => ({ serverTime: new Date(s().now()).toISOString() }) },

  { method: 'POST', pattern: /^\/auth\/login$/, handler: ({ body }) => s().login(body) },
  { method: 'POST', pattern: /^\/auth\/register$/, handler: ({ body }) => s().register(body) },
  { method: 'POST', pattern: /^\/auth\/refresh$/, fast: true, handler: ({ body }) => s().refresh(body.refreshToken) },
  { method: 'POST', pattern: /^\/auth\/logout$/, fast: true, handler: ({ body }) => void s().logout(body.refreshToken) },

  { method: 'GET', pattern: /^\/me$/, handler: ({ userId }) => s().me(userId()) },
  { method: 'PATCH', pattern: /^\/me$/, handler: ({ userId, body }) => s().updateProfile(userId(), body) },
  { method: 'PUT', pattern: /^\/me\/password$/, handler: ({ userId, body }) => void s().changePassword(userId(), body) },
  { method: 'GET', pattern: /^\/me\/notifications$/, handler: ({ userId }) => s().notifications(userId()) },
  { method: 'PUT', pattern: /^\/me\/notifications$/, handler: ({ userId, body }) => s().updateNotifications(userId(), body) },

  { method: 'GET', pattern: /^\/habits$/, handler: ({ userId }) => s().listHabits(userId()) },
  { method: 'POST', pattern: /^\/habits$/, handler: ({ userId, body }) => s().createHabit(userId(), body) },
  {
    method: 'DELETE',
    pattern: /^\/habits\/([^/]+)$/,
    handler: ({ userId, params }) => void mockHub().publish(s().deleteHabit(userId(), params[0])),
  },
  {
    method: 'POST',
    pattern: /^\/habits\/([^/]+)\/check-ins$/,
    chaos: true,
    handler: ({ userId, params, req }) => {
      const { response, event } = s().checkIn(userId(), params[0], req.headers.get('Idempotency-Key'));
      mockHub().publish(event);
      return response;
    },
  },
  {
    method: 'POST',
    pattern: /^\/habits\/([^/]+)\/invites$/,
    handler: ({ userId, params }) => s().createInvite(userId(), params[0], environment.appUrl || location.origin),
  },

  { method: 'GET', pattern: /^\/rooms\/([^/]+)$/, handler: ({ userId, params }) => s().room(userId(), params[0]) },
  {
    method: 'DELETE',
    pattern: /^\/rooms\/([^/]+)\/members\/me$/,
    handler: ({ userId, params }) => void mockHub().publish(s().leaveRoom(userId(), params[0])),
  },

  { method: 'GET', pattern: /^\/invites\/([^/]+)$/, handler: ({ userId, params }) => s().previewInvite(userId(), params[0]) },
  {
    method: 'POST',
    pattern: /^\/invites\/([^/]+)\/accept$/,
    handler: ({ userId, params }) => {
      const { habitId, event } = s().acceptInvite(userId(), params[0]);
      mockHub().publish(event);
      return { habitId };
    },
  },
];
