import type { AppEnvironment } from './environment.model';

/**
 * Production build — whatever command the host runs (`ng build`,
 * `npm run build`, `--configuration production`).
 *
 * There is no public SyncHabit API, so the static site ships the in-browser
 * mock backend (see core/mock): sign-up, rooms and check-ins work on any
 * static host. For a real backend build with `npm run build:api`.
 */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: '/api/v1',
  wsUrl: '/ws',
  useMockApi: true,
  appUrl: '',
};
