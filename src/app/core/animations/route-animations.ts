import {
  animate,
  animateChild,
  group,
  keyframes,
  query,
  stagger,
  style,
  transition,
  trigger,
} from '@angular/animations';

/**
 * @angular/animations triggers.
 *
 * Split of responsibilities:
 *   • @angular/animations — anything tied to Angular state (route changes,
 *     list items entering/leaving, toasts). Angular knows when nodes enter and
 *     leave, so :enter/:leave belongs here.
 *   • GSAP — imperative, physics-y motion: card stagger on first paint,
 *     particle bursts, progress ring tweens, magnetic dock.
 *
 * NOTE: @angular/animations is deprecated in Angular 22 in favour of native
 * animate.enter / animate.leave. It is used deliberately; this file is the
 * single place to rewrite during a migration.
 */

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Page transition. Trigger value = current URL path. */
export const routeTransition = trigger('routeTransition', [
  transition('* => *', [
    // The old page is dropped at once (no overlapping layouts / scroll jumps)…
    query(':leave', [style({ display: 'none' })], { optional: true }),
    // …and the new one rises out of a soft blur.
    query(':enter', [style({ opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)' })], {
      optional: true,
    }),
    group([
      query(':enter', [animate(`520ms ${EASE}`, style({ opacity: 1, transform: 'none', filter: 'blur(0)' }))], {
        optional: true,
      }),
      query(':enter', animateChild(), { optional: true }),
    ]),
  ]),
]);

/** Staggered list for items added/removed after first paint (activity feed, leaderboard) */
export const listStagger = trigger('listStagger', [
  transition('* => *', [
    query(
      ':enter',
      [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        stagger(50, [animate(`420ms ${EASE}`, style({ opacity: 1, transform: 'none' }))]),
      ],
      { optional: true },
    ),
    query(':leave', [animate('180ms ease-in', style({ opacity: 0, transform: 'scale(0.96)' }))], {
      optional: true,
    }),
  ]),
]);

/** Block that appears / disappears (form alerts, inline banners) */
export const fadeSlide = trigger('fadeSlide', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(-8px)' }),
    animate(`300ms ${EASE}`, style({ opacity: 1, transform: 'none' })),
  ]),
  transition(':leave', [animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))]),
]);

/** Toast / dialog pop */
export const popIn = trigger('popIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(16px) scale(0.96)' }),
    animate(`380ms ${EASE}`, style({ opacity: 1, transform: 'none' })),
  ]),
  transition(':leave', [animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(8px) scale(0.98)' }))]),
]);

/** A new activity row sliding in at the top of the feed with an ember flash */
export const feedItem = trigger('feedItem', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-16px)', height: 0 }),
    animate(
      `520ms ${EASE}`,
      keyframes([
        style({ opacity: 0, transform: 'translateX(-16px)', height: 0, offset: 0 }),
        style({ opacity: 1, transform: 'translateX(4px)', height: '*', offset: 0.6 }),
        style({ opacity: 1, transform: 'none', height: '*', offset: 1 }),
      ]),
    ),
  ]),
]);
