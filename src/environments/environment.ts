import type { AppEnvironment } from './environment.model';

/**
 * Production environment.
 * Point `apiUrl` / `wsUrl` at the real backend before deploying.
 */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: '/api/v1',
  wsUrl: '/ws',
  useMockApi: false,
  appUrl: '',
};
