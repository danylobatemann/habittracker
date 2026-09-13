import type { AppEnvironment } from './environment.model';

/**
 * Build against a real backend: `npm run build:api` (configuration "api").
 * The mock backend is stripped from this bundle, so `apiUrl` / `wsUrl`
 * must point at a running SyncHabit API.
 */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: '/api/v1',
  wsUrl: '/ws',
  useMockApi: false,
  appUrl: '',
};
