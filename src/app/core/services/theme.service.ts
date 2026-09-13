import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'synchabit.theme';

/**
 * Dark ("night summit") is the default. index.html applies the stored theme
 * before first paint; this service keeps it in sync afterwards.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.readInitial());

  constructor() {
    effect(() => {
      const theme = this.theme();
      const root = this.doc.documentElement;
      if (theme === 'light') root.setAttribute('data-theme', 'light');
      else root.removeAttribute('data-theme');
      this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f1ed' : '#060709');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* storage unavailable — theme still applies for this visit */
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private readInitial(): Theme {
    return this.doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
}
