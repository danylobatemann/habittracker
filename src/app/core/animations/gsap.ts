import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Single GSAP entry point: plugins are registered exactly once.
 * Components must call `useGsap()` instead of importing gsap directly.
 */
let registered = false;

export function useGsap(): { gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger } {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function refreshScrollTriggers(): void {
  if (!registered) return;
  ScrollTrigger.refresh();
}

/**
 * Failsafe for a stalled GSAP ticker.
 *
 * Entrance animations hide content first (opacity: 0) and let GSAP reveal it.
 * If rAF never runs (tab opened in background, throttled, not composited) the
 * content would stay invisible forever. We check the *result* instead of the
 * ticker: when an on-screen element is still transparent after FAILSAFE_MS we
 * reveal it without animation. `setTimeout` runs on wall time, not frames.
 */
const FAILSAFE_MS = 1600;

interface VisibilityGuard {
  elements: HTMLElement[];
  reveal: () => void;
}

const guards = new Set<VisibilityGuard>();
let sweepTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function isOnScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function sweep(): void {
  sweepTimer = null;
  for (const guard of [...guards]) {
    const stuck = guard.elements.some((el) => isOnScreen(el) && getComputedStyle(el).opacity === '0');
    if (stuck) {
      guard.reveal();
      guards.delete(guard);
    }
  }
  if (guards.size === 0) stopWatching();
}

function scheduleSweep(): void {
  if (sweepTimer !== null) clearTimeout(sweepTimer);
  sweepTimer = setTimeout(sweep, FAILSAFE_MS);
}

function stopWatching(): void {
  if (sweepTimer !== null) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  if (listening) {
    window.removeEventListener('scroll', scheduleSweep);
    window.removeEventListener('resize', scheduleSweep);
    listening = false;
  }
}

/** Register an emergency reveal. Returns an unsubscribe fn for DestroyRef.onDestroy. */
export function guaranteeVisible(elements: HTMLElement[], reveal: () => void): () => void {
  if (typeof window === 'undefined' || elements.length === 0) return () => {};

  const guard: VisibilityGuard = { elements, reveal };
  guards.add(guard);

  if (!listening) {
    window.addEventListener('scroll', scheduleSweep, { passive: true });
    window.addEventListener('resize', scheduleSweep, { passive: true });
    listening = true;
  }
  scheduleSweep();

  return () => {
    guards.delete(guard);
    if (guards.size === 0) stopWatching();
  };
}
