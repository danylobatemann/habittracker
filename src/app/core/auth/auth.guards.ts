import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Only for signed-in users; otherwise → /login?returnUrl=… (invite links survive the detour) */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.restoreSession()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Login / register pages: a signed-in user goes straight to the dashboard */
export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await auth.restoreSession())) return true;
  const returnUrl = route.queryParamMap.get('returnUrl');
  return router.parseUrl(isSafeReturnUrl(returnUrl) ? returnUrl : '/dashboard');
};

/** Public pages: never blocks, but resolves the session so the header shows the right state */
export const sessionGuard: CanActivateFn = async () => {
  await inject(AuthService).restoreSession();
  return true;
};

/** Open-redirect protection: only same-origin absolute paths */
export function isSafeReturnUrl(url: string | null): url is string {
  return !!url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}
