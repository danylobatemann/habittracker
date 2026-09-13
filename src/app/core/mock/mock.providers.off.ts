import type { HttpInterceptorFn } from '@angular/common/http';
import type { Provider } from '@angular/core';

/** Production replacement for mock.providers.ts — talks to the real backend. */
export const mockInterceptors: HttpInterceptorFn[] = [];
export const mockProviders: Provider[] = [];
export const demoAccount: { email: string; password: string; inviteToken: string } | null = null;
