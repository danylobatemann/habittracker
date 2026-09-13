import type { AppEnvironment } from './environment.model';

/**
 * Local development.
 * `useMockApi: true` runs an in-browser fake backend (see core/mock) so the UI
 * works without a server. Flip it to `false` once the API is running locally.
 */
export const environment: AppEnvironment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  wsUrl: 'ws://localhost:3000/ws',
  useMockApi: true,
  appUrl: '',
};
