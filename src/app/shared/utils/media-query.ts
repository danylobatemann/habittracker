import { DestroyRef, type Signal, inject, signal } from '@angular/core';

/** Phones: below the dock breakpoint */
export const PHONE_QUERY = '(max-width: 599px)';

/** `matchMedia` as a signal — for sizes that live in inputs (rings, avatars), not in CSS */
export function injectMediaQuery(query: string): Signal<boolean> {
  const mql = typeof matchMedia === 'function' ? matchMedia(query) : null;
  const matches = signal(mql?.matches ?? false);
  if (mql) {
    const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
    mql.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
  }
  return matches.asReadonly();
}
