import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { popIn } from '../../core/animations/route-animations';
import { type Toast, ToastService } from '../../core/services/toast.service';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';

const ICONS: Record<Toast['kind'], IconName> = {
  info: 'bell',
  success: 'check',
  error: 'alert',
  xp: 'bolt',
};

/** Renders ToastService.toasts(): bottom-centre on phones, bottom-right on desktop */
@Component({
  selector: 'sh-toast-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  animations: [popIn],
  template: `
    <ol class="stack" aria-live="polite" aria-relevant="additions">
      @for (toast of toasts.toasts(); track toast.id) {
        <li [class]="'toast toast--' + toast.kind" @popIn [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="toast__icon"><sh-icon [name]="icon(toast)" /></span>
          <p class="toast__msg">{{ toast.message }}</p>
          @if (toast.action; as action) {
            <button type="button" class="toast__action" (click)="action.run(); toasts.dismiss(toast.id)">{{ action.label }}</button>
          }
          <button type="button" class="toast__close" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">
            <sh-icon name="x" />
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: var(--z-toast);
      padding: 0 0.75rem max(0.75rem, env(safe-area-inset-bottom));
      pointer-events: none;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 420px;
      margin: 0 auto;
      padding: 0;
      list-style: none;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.6rem 0.5rem 0.6rem 0.7rem;
      border: 1px solid var(--line-strong);
      border-radius: 18px;
      background: color-mix(in srgb, var(--surface-solid) 92%, transparent);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      box-shadow: var(--shadow-deep);
      color: var(--text);
    }

    .toast__icon {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--surface-3);
      color: var(--text-soft);
    }

    .toast--success .toast__icon { background: rgba(var(--ember-rgb), 0.14); color: var(--ember); }
    .toast--error { border-color: rgba(255, 83, 100, 0.4); }
    .toast--error .toast__icon { background: rgba(255, 83, 100, 0.14); color: var(--danger); }

    .toast--xp {
      border-color: rgba(var(--ember-rgb), 0.5);
      box-shadow: var(--shadow-deep), var(--glow-md);
    }

    .toast--xp .toast__icon {
      background: linear-gradient(135deg, var(--ember-strong), var(--gold));
      color: #1a0d00;
    }

    .toast--xp .toast__msg { font-family: var(--font-mono); font-weight: 700; color: var(--gold); }

    .toast__msg {
      flex: 1;
      min-width: 0;
      font-size: var(--fs-sm);
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .toast__action {
      flex-shrink: 0;
      min-height: 36px;
      padding: 0 0.8rem;
      border: 1px solid rgba(var(--ember-rgb), 0.5);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--ember-soft);
      font-weight: 700;
      font-size: var(--fs-xs);
    }

    .toast__close {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--text-muted);
    }

    .toast__close:hover { color: var(--heading); background: var(--surface-3); }

    @media (min-width: 768px) {
      :host { left: auto; padding: 0 1.25rem 1.25rem; }
      .stack { width: 400px; }
    }
  `,
})
export class ToastOutletComponent {
  protected readonly toasts = inject(ToastService);

  protected icon(toast: Toast): IconName {
    return ICONS[toast.kind];
  }
}
