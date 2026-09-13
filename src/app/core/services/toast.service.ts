import { Injectable, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error' | 'xp';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastOptions {
  /** Toasts with the same key replace each other instead of stacking */
  key?: string;
  durationMs?: number;
  action?: Toast['action'];
}

const MAX_VISIBLE = 4;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  private readonly keys = new Map<string, number>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _toasts = signal<Toast[]>([]);

  readonly toasts = this._toasts.asReadonly();

  info(message: string, options?: ToastOptions): number {
    return this.show('info', message, options);
  }

  success(message: string, options?: ToastOptions): number {
    return this.show('success', message, options);
  }

  error(message: string, options?: ToastOptions): number {
    return this.show('error', message, { durationMs: 6000, ...options });
  }

  xp(message: string, options?: ToastOptions): number {
    return this.show('xp', message, { durationMs: 3200, ...options });
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    for (const [key, value] of this.keys) if (value === id) this.keys.delete(key);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(kind: ToastKind, message: string, { key, durationMs = 4200, action }: ToastOptions = {}): number {
    if (key && this.keys.has(key)) this.dismiss(this.keys.get(key)!);

    const id = ++this.seq;
    if (key) this.keys.set(key, id);
    this._toasts.update((list) => [...list, { id, kind, message, action }].slice(-MAX_VISIBLE));
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), durationMs),
    );
    return id;
  }
}
