import type { HttpInterceptorFn } from '@angular/common/http';
import type { Provider } from '@angular/core';

import { environment } from '../../../environments/environment';
import { REALTIME_TRANSPORT } from '../realtime/realtime-transport';
import { mockBackendInterceptor } from './mock-backend.interceptor';
import { mockRealtimeTransport } from './mock-realtime';
import { DEMO_EMAIL, DEMO_INVITE_TOKEN, DEMO_PASSWORD } from './mock-server';

/**
 * Mock wiring for development and the demo build.
 * The production build swaps this file for `mock.providers.off.ts`
 * (angular.json → fileReplacements), so no mock code ships to production.
 */
export const mockInterceptors: HttpInterceptorFn[] = environment.useMockApi ? [mockBackendInterceptor] : [];

export const mockProviders: Provider[] = environment.useMockApi
  ? [{ provide: REALTIME_TRANSPORT, useValue: mockRealtimeTransport }]
  : [];

/** Shown on the sign-in page while the mock backend is active */
export const demoAccount: { email: string; password: string; inviteToken: string } | null = environment.useMockApi
  ? { email: DEMO_EMAIL, password: DEMO_PASSWORD, inviteToken: DEMO_INVITE_TOKEN }
  : null;
