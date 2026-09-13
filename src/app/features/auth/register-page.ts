import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { fadeSlide } from '../../core/animations/route-animations';
import { AuthService } from '../../core/auth/auth.service';
import { isSafeReturnUrl } from '../../core/auth/auth.guards';
import { ApiError } from '../../core/http/api-error';
import { ButtonComponent } from '../../shared/components/button/button';
import { FormFieldComponent } from '../../shared/components/form-field/form-field';
import { IconComponent } from '../../shared/components/icon/icon';
import { applyServerErrors, controlError } from '../../shared/utils/form-errors';
import { AuthShellComponent } from './auth-shell';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_RULE = 'Use at least 8 characters with a letter and a number.';

@Component({
  selector: 'sh-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, ButtonComponent, FormFieldComponent, IconComponent],
  animations: [fadeSlide],
  template: `
    <sh-auth-shell
      heading="Start climbing"
      subheading="Create an account — it takes 20 seconds."
      eyebrow="Base to summit"
      quote="Streaks are easier when someone is watching the rope."
    >
      @if (formError(); as message) {
        <p class="alert" role="alert" @fadeSlide><sh-icon name="alert" /> {{ message }}</p>
      }

      <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <sh-form-field label="Display name" forId="reg-name" hint="Friends see this in shared rooms." [error]="errors().displayName">
          <input
            id="reg-name"
            class="input"
            formControlName="displayName"
            autocomplete="nickname"
            maxlength="32"
            [attr.aria-invalid]="!!errors().displayName"
            [attr.aria-describedby]="errors().displayName ? 'reg-name-error' : 'reg-name-hint'"
          />
        </sh-form-field>

        <sh-form-field label="Email" forId="reg-email" [error]="errors().email">
          <input
            id="reg-email"
            class="input"
            type="email"
            formControlName="email"
            autocomplete="email"
            inputmode="email"
            [attr.aria-invalid]="!!errors().email"
            [attr.aria-describedby]="errors().email ? 'reg-email-error' : null"
          />
        </sh-form-field>

        <sh-form-field label="Password" forId="reg-password" hint="At least 8 characters, with a letter and a number." [error]="errors().password">
          <input
            id="reg-password"
            class="input"
            type="password"
            formControlName="password"
            autocomplete="new-password"
            [attr.aria-invalid]="!!errors().password"
            [attr.aria-describedby]="errors().password ? 'reg-password-error' : 'reg-password-hint'"
          />
          <span ffAside class="strength mono" [attr.data-level]="strength()">{{ strengthLabel() }}</span>
        </sh-form-field>

        <p class="tz muted">
          <sh-icon name="clock" />
          <span>Your day resets at midnight in <strong>{{ timezone }}</strong>.</span>
        </p>

        <button shButton type="submit" size="lg" block [busy]="busy()" [disabled]="busy()">
          Create account <sh-icon name="arrow-right" />
        </button>
      </form>

      <p class="switch-auth muted">
        Already climbing?
        <a routerLink="/login" [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}">Sign in</a>
      </p>
    </sh-auth-shell>
  `,
  styles: `
    :host { display: block; }

    .form { display: grid; gap: 1.1rem; }

    .strength {
      font-size: var(--fs-xs);
      color: var(--text-muted);
    }

    .strength[data-level='1'] { color: var(--danger); }
    .strength[data-level='2'] { color: var(--gold); }
    .strength[data-level='3'] { color: var(--ember); text-shadow: 0 0 10px rgba(var(--ember-rgb), 0.6); }

    .tz {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin: 0;
      font-size: var(--fs-sm);
      line-height: 1.45;
    }

    .tz sh-icon { flex-shrink: 0; width: 16px; height: 16px; margin-top: 0.12em; }
    .tz strong { overflow-wrap: anywhere; }

    .tz strong { color: var(--text); font-weight: 600; }

    .switch-auth { margin: 0; text-align: center; font-size: var(--fs-sm); }
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();

  protected readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly revision = signal(0);

  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(32)]],
    // Mirrors the server rules (auth/register): 8+ chars with a letter and a digit
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(PASSWORD_PATTERN)]],
  });

  protected readonly errors = computed(() => {
    this.revision();
    const s = this.submitted();
    const c = this.form.controls;
    return {
      displayName: controlError(c.displayName, s, 'Display name'),
      email: c.email.hasError('pattern') && (c.email.touched || s) ? 'Enter a valid email address.' : controlError(c.email, s, 'Email'),
      password:
        (c.password.hasError('minlength') || c.password.hasError('pattern')) && (c.password.touched || s)
          ? PASSWORD_RULE
          : controlError(c.password, s, 'Password'),
    };
  });

  protected readonly strength = computed(() => {
    this.revision();
    const pw = this.form.controls.password.value;
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
    return pw.length < 8 ? 1 : Math.min(3, Math.max(1, score - 1));
  });

  protected readonly strengthLabel = computed(() => ['', 'weak', 'okay', 'strong'][this.strength()]);

  constructor() {
    this.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.revision.update((n) => n + 1));
  }

  protected submit(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }

    const { displayName, email, password } = this.form.getRawValue();
    this.busy.set(true);

    this.auth
      .register({ displayName: displayName.trim(), email: email.trim(), password, timezone: this.timezone })
      .subscribe({
        next: () => {
          const target = this.returnUrl() ?? null;
          void this.router.navigateByUrl(isSafeReturnUrl(target) ? target : '/dashboard', { replaceUrl: true });
        },
        error: (err: unknown) => {
          this.busy.set(false);
          const error = ApiError.from(err);
          if (error.code === 'EMAIL_TAKEN') {
            this.form.controls.email.setErrors({ server: 'An account with this email already exists.' });
            this.form.controls.email.markAsTouched();
          } else if (!applyServerErrors(this.form, error)) {
            this.formError.set(error.message);
          }
          this.revision.update((n) => n + 1);
        },
      });
  }
}
