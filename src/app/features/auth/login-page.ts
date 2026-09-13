import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { fadeSlide } from '../../core/animations/route-animations';
import { AuthService } from '../../core/auth/auth.service';
import { isSafeReturnUrl } from '../../core/auth/auth.guards';
import { ApiError } from '../../core/http/api-error';
import { demoAccount } from '../../core/mock/mock.providers';
import { ButtonComponent } from '../../shared/components/button/button';
import { FormFieldComponent } from '../../shared/components/form-field/form-field';
import { IconComponent } from '../../shared/components/icon/icon';
import { applyServerErrors, controlError } from '../../shared/utils/form-errors';
import { AuthShellComponent } from './auth-shell';

@Component({
  selector: 'sh-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, ButtonComponent, FormFieldComponent, IconComponent],
  animations: [fadeSlide],
  template: `
    <sh-auth-shell
      heading="Welcome back"
      subheading="Sign in to keep your streaks burning."
      eyebrow="Basecamp"
      quote="Every summit starts with one check-in."
    >
      @if (reason() === 'expired') {
        <p class="alert alert--info" role="status" @fadeSlide>
          <sh-icon name="clock" /> Your session ended. Sign in again to continue where you left off.
        </p>
      } @else if (isInvite()) {
        <p class="alert alert--info" role="status" @fadeSlide>
          <sh-icon name="users" /> Sign in to accept your invite — you’ll land right back on it.
        </p>
      }

      @if (formError(); as message) {
        <p class="alert" role="alert" @fadeSlide><sh-icon name="alert" /> {{ message }}</p>
      }

      <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <sh-form-field label="Email" forId="login-email" [error]="emailError()">
          <input
            id="login-email"
            class="input"
            type="email"
            formControlName="email"
            autocomplete="email"
            inputmode="email"
            placeholder="you@example.com"
            [attr.aria-invalid]="!!emailError()"
            [attr.aria-describedby]="emailError() ? 'login-email-error' : null"
          />
        </sh-form-field>

        <sh-form-field label="Password" forId="login-password" [error]="passwordError()">
          <div class="pw">
            <input
              id="login-password"
              class="input"
              [type]="showPassword() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password"
              [attr.aria-invalid]="!!passwordError()"
              [attr.aria-describedby]="passwordError() ? 'login-password-error' : null"
            />
            <button
              type="button"
              class="pw__toggle"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              [attr.aria-pressed]="showPassword()"
              (click)="showPassword.set(!showPassword())"
            >
              <sh-icon [name]="showPassword() ? 'eye-off' : 'eye'" />
            </button>
          </div>
        </sh-form-field>

        <label class="remember">
          <input type="checkbox" formControlName="remember" />
          <span>Keep me signed in on this device</span>
        </label>

        <button shButton type="submit" size="lg" block [busy]="busy()" [disabled]="busy()">
          Sign in <sh-icon name="arrow-right" />
        </button>
      </form>

      @if (demo) {
        <div class="demo">
          <p><sh-icon name="spark" /> Demo account</p>
          <p class="mono">{{ demo.email }} · {{ demo.password }}</p>
          <button shButton variant="ghost" size="sm" type="button" (click)="fillDemo()">Use demo account</button>
        </div>
      }

      <p class="switch-auth muted">
        New here?
        <a routerLink="/register" [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}">Create an account</a>
      </p>
    </sh-auth-shell>
  `,
  styles: `
    :host { display: block; }

    .form { display: grid; gap: 1.1rem; }

    .pw { position: relative; }
    .pw .input { padding-right: 3.2rem; }

    .pw__toggle {
      position: absolute;
      top: 50%;
      right: 0.35rem;
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      translate: 0 -50%;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--text-muted);
    }

    .pw__toggle:hover { color: var(--heading); }

    .remember {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-height: 44px;
      color: var(--text-soft);
      font-size: var(--fs-sm);
      cursor: pointer;
    }

    .remember input {
      width: 20px;
      height: 20px;
      accent-color: var(--ember);
    }

    .demo {
      display: grid;
      gap: 0.4rem;
      justify-items: start;
      padding: 0.9rem 1rem;
      border: 1px dashed rgba(var(--ember-rgb), 0.4);
      border-radius: var(--radius-input);
      font-size: var(--fs-sm);
    }

    .demo p { margin: 0; display: flex; gap: 0.4rem; align-items: center; }
    .demo p:first-child { color: var(--ember-soft); font-weight: 600; }
    .demo .mono { color: var(--text); overflow-wrap: anywhere; }

    .switch-auth { margin: 0; text-align: center; font-size: var(--fs-sm); }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params, bound by withComponentInputBinding */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly demo = demoAccount;
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** Bumped after every value/status change so computed error messages re-evaluate */
  private readonly revision = signal(0);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    remember: [true],
  });

  protected readonly isInvite = computed(() => this.returnUrl()?.startsWith('/invite/') ?? false);

  protected readonly emailError = computed(() => {
    this.revision();
    return controlError(this.form.controls.email, this.submitted(), 'Email');
  });

  protected readonly passwordError = computed(() => {
    this.revision();
    return controlError(this.form.controls.password, this.submitted(), 'Password');
  });

  constructor() {
    this.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.revision.update((n) => n + 1));
  }

  protected fillDemo(): void {
    if (!this.demo) return;
    this.form.patchValue({ email: this.demo.email, password: this.demo.password });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password, remember } = this.form.getRawValue();
    this.busy.set(true);

    this.auth.login({ email: email.trim(), password }, remember).subscribe({
      next: () => {
        const target = this.returnUrl() ?? null;
        void this.router.navigateByUrl(isSafeReturnUrl(target) ? target : '/dashboard', { replaceUrl: true });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const error = ApiError.from(err);
        if (error.code === 'INVALID_CREDENTIALS') {
          this.formError.set('That email and password don’t match. Try again.');
          this.form.controls.password.reset('');
        } else if (!applyServerErrors(this.form, error)) {
          this.formError.set(error.message);
        }
        this.revision.update((n) => n + 1);
      },
    });
  }
}
