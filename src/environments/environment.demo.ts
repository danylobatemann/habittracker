import type { AppEnvironment } from './environment.model';

/** Static demo build (GitHub Pages, Netlify…): optimized bundle + in-browser mock backend. */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: '/api/v1',
  wsUrl: '/ws',
  useMockApi: true,
  appUrl: '',
};
