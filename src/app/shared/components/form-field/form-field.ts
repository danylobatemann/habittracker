import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

import { IconComponent } from '../icon/icon';

/**
 * Form field wrapper: label, projected control, hint or error.
 *
 *   <sh-form-field label="Email" forId="login-email" [error]="emailError()">
 *     <input id="login-email" class="input" [attr.aria-describedby]="'login-email-error'" … />
 *   </sh-form-field>
 *
 * Message ids are `${forId}-error` / `${forId}-hint` — reference them from aria-describedby.
 */
@Component({
  selector: 'sh-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="ff__head">
      <label class="ff__label" [attr.for]="forId()">{{ label() }}</label>
      <ng-content select="[ffAside]" />
    </div>

    <ng-content />

    <div class="ff__msg" aria-live="polite">
      @if (error()) {
        <p class="ff__error" [id]="forId() + '-error'">
          <sh-icon name="alert" />
          {{ error() }}
        </p>
      } @else if (hint()) {
        <p class="ff__hint" [id]="forId() + '-hint'">{{ hint() }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      min-width: 0;
    }

    .ff__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
    }

    .ff__label {
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--text);
    }

    .ff__msg:empty { display: none; }

    .ff__error,
    .ff__hint {
      font-size: var(--fs-xs);
      line-height: 1.45;
    }

    .ff__error {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      color: var(--danger);
      animation: ff-in 220ms var(--ease-out);
    }

    .ff__error sh-icon { margin-top: 0.05rem; }
    .ff__hint { color: var(--text-muted); }

    @keyframes ff-in {
      from { opacity: 0; transform: translateY(-4px); }
    }
  `,
})
export class FormFieldComponent {
  readonly label = input.required<string>();
  readonly forId = input.required<string>();
  readonly hint = input<string>('');
  readonly error = input<string | null>(null);
  readonly required = input(false, { transform: booleanAttribute });
}
