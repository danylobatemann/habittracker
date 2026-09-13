import type { Routes } from '@angular/router';

import { authGuard, guestGuard, sessionGuard } from './core/auth/auth.guards';

const title = (page: string) => `${page} · SyncHabit`;

/**
 * Every page is lazy. Guards await `AuthService.restoreSession()`, so a
 * returning user never sees the login page flash.
 *
 * `/invite/:token` is behind authGuard: an anonymous friend is sent to
 * /login?returnUrl=/invite/… and lands back on the invite after signing in.
 */
export const routes: Routes = [
  {
    path: '',
    title: 'SyncHabit — Climb your habits together',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/landing/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    title: title('Sign in'),
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: title('Create account'),
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'dashboard',
    title: title('Dashboard'),
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'habits/:habitId',
    title: title('Habit room'),
    canActivate: [authGuard],
    loadComponent: () => import('./features/room/room-page').then((m) => m.RoomPage),
  },
  {
    path: 'invite/:token',
    title: title('You’re invited'),
    canActivate: [authGuard],
    loadComponent: () => import('./features/invite/invite-page').then((m) => m.InvitePage),
  },
  {
    path: 'profile',
    title: title('Profile & settings'),
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: '**',
    title: title('Lost on the mountain'),
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
