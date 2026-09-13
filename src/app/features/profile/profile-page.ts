import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';

import { fadeSlide } from '../../core/animations/route-animations';
import { ProfileApi } from '../../core/api/profile-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/http/api-error';
import type { NotificationSettings } from '../../core/models/user.models';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { ButtonComponent } from '../../shared/components/button/button';
import { FormFieldComponent } from '../../shared/components/form-field/form-field';
import { IconComponent } from '../../shared/components/icon/icon';
import { RevealDirective } from '../../shared/directives/reveal.directive';
import { SpotlightDirective } from '../../shared/directives/spotlight.directive';
import { applyServerErrors, controlError } from '../../shared/utils/form-errors';

const HUE_SWATCHES = [24, 42, 200, 265, 330, 150];

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword');
  if (!confirm) return null;
  const mismatch = !!confirm.value && next !== confirm.value;
  const { mismatch: _, ...rest } = confirm.errors ?? {};
  confirm.setErrors(mismatch ? { ...rest, mismatch: true } : Object.keys(rest).length ? rest : null);
  return null;
}

@Component({
  selector: 'sh-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AvatarComponent, ButtonComponent, FormFieldComponent, IconComponent, RevealDirective, SpotlightDirective],
  animations: [fadeSlide],
  template: `
    <div class="page container">
      <header class="intro">
        <p class="eyebrow">Basecamp</p>
        <h1>Profile &amp; settings</h1>
      </header>

      <div class="layout">
        <!-- Account -->
        <section class="panel section" shSpotlight shReveal aria-labelledby="account-title">
          <div class="section__head">
            <h2 id="account-title"><sh-icon name="user" /> Account</h2>
            @if (auth.user(); as user) {
              <span class="badge badge--ember mono">LV {{ user.level }} · {{ user.xp }} XP</span>
            }
          </div>

          <form class="form" [formGroup]="account" (ngSubmit)="saveAccount()" novalidate>
            <div class="avatar-row">
              <sh-avatar [name]="preview().displayName || '?'" [hue]="preview().avatarHue" [size]="84" [ring]="true" />
              <div class="hue">
                <label for="p-hue" class="label">Avatar colour</label>
                <input id="p-hue" type="range" min="0" max="359" step="1" formControlName="avatarHue" class="hue__range" />
                <div class="swatches" role="group" aria-label="Quick colours">
                  @for (h of swatches; track h) {
                    <button
                      type="button"
                      class="swatch"
                      [style.--h]="h"
                      [attr.aria-label]="'Hue ' + h"
                      [attr.aria-pressed]="preview().avatarHue === h"
                      (click)="account.controls.avatarHue.setValue(h); account.markAsDirty()"
                    ></button>
                  }
                </div>
              </div>
            </div>

            <sh-form-field label="Display name" forId="p-name" hint="Shown to friends in shared rooms." [error]="accountErrors().displayName">
              <input
                id="p-name"
                class="input"
                formControlName="displayName"
                autocomplete="nickname"
                maxlength="32"
                [attr.aria-invalid]="!!accountErrors().displayName"
                [attr.aria-describedby]="accountErrors().displayName ? 'p-name-error' : 'p-name-hint'"
              />
            </sh-form-field>

            <sh-form-field label="Email" forId="p-email" hint="Contact support to change your email.">
              <input id="p-email" class="input" [value]="auth.user()?.email ?? ''" readonly aria-describedby="p-email-hint" />
            </sh-form-field>

            <sh-form-field label="Timezone" forId="p-tz" hint="Your day (and streak) resets at midnight here.">
              <select id="p-tz" class="select" formControlName="timezone" aria-describedby="p-tz-hint">
                @for (tz of timezones; track tz) {
                  <option [value]="tz">{{ tz }}</option>
                }
              </select>
            </sh-form-field>

            @if (accountError(); as message) {
              <p class="alert" role="alert" @fadeSlide><sh-icon name="alert" /> {{ message }}</p>
            }

            <div class="actions">
              <button shButton type="submit" [busy]="accountBusy()" [disabled]="accountBusy() || !accountDirty()">Save changes</button>
              @if (accountDirty() && !accountBusy()) {
                <button shButton variant="ghost" type="button" (click)="resetAccount()" @fadeSlide>Discard</button>
              }
            </div>
          </form>
        </section>

        <div class="col">
          <!-- Notifications -->
          <section class="panel section" shSpotlight shReveal aria-labelledby="notif-title">
            <div class="section__head">
              <h2 id="notif-title"><sh-icon name="bell" /> Notifications</h2>
              <span class="saved muted" aria-live="polite">{{ notifSaving() ? 'Saving…' : notifSavedOnce() ? 'Saved' : '' }}</span>
            </div>

            @if (notif(); as n) {
              <div class="stack">
                <label class="switch">
                  <span><strong>Reminders</strong><small class="muted">A nudge when a habit is still open</small></span>
                  <input type="checkbox" role="switch" [checked]="n.pushReminders" (change)="patchNotif({ pushReminders: $any($event.target).checked })" />
                </label>

                @if (n.pushReminders) {
                  <div class="time" @fadeSlide>
                    <label for="p-time" class="label">Remind me at</label>
                    <input id="p-time" type="time" class="input input--time" [value]="n.reminderTime" (change)="onTime($event)" />
                  </div>
                }

                <label class="switch">
                  <span><strong>Friend activity</strong><small class="muted">When someone in your rooms checks in</small></span>
                  <input type="checkbox" role="switch" [checked]="n.friendActivity" (change)="patchNotif({ friendActivity: $any($event.target).checked })" />
                </label>

                <label class="switch">
                  <span><strong>Streak warnings</strong><small class="muted">Before a streak is about to break</small></span>
                  <input type="checkbox" role="switch" [checked]="n.streakWarnings" (change)="patchNotif({ streakWarnings: $any($event.target).checked })" />
                </label>

                <div class="digest">
                  <span class="label" id="digest-label">Email digest</span>
                  <div class="segmented" role="group" aria-labelledby="digest-label">
                    @for (d of digests; track d.value) {
                      <button type="button" [attr.aria-pressed]="n.emailDigest === d.value" (click)="patchNotif({ emailDigest: d.value })">{{ d.label }}</button>
                    }
                  </div>
                </div>
              </div>
            } @else if (notifFailed()) {
              <div class="notif-error">
                <p class="muted">Couldn’t load your notification settings.</p>
                <button shButton variant="ghost" size="sm" type="button" (click)="loadNotifications()">Try again</button>
              </div>
            } @else {
              <div class="stack" aria-busy="true">
                @for (i of [0, 1, 2, 3]; track i) {
                  <span class="skeleton skel-row"></span>
                }
              </div>
            }
          </section>

          <!-- Appearance -->
          <section class="panel section" shReveal aria-labelledby="look-title">
            <h2 id="look-title"><sh-icon [name]="theme.theme() === 'dark' ? 'moon' : 'sun'" /> Appearance</h2>
            <div class="segmented" role="group" aria-labelledby="look-title">
              <button type="button" [attr.aria-pressed]="theme.theme() === 'dark'" (click)="theme.theme() !== 'dark' && theme.toggle()">
                <sh-icon name="moon" /> Night
              </button>
              <button type="button" [attr.aria-pressed]="theme.theme() === 'light'" (click)="theme.theme() !== 'light' && theme.toggle()">
                <sh-icon name="sun" /> Day
              </button>
            </div>
          </section>

          <!-- Password -->
          <section class="panel section" shReveal aria-labelledby="pw-title">
            <h2 id="pw-title"><sh-icon name="lock" /> Password</h2>
            <form class="form" [formGroup]="password" (ngSubmit)="changePassword()" novalidate>
              <input type="text" autocomplete="username" [value]="auth.user()?.email ?? ''" hidden readonly />

              <sh-form-field label="Current password" forId="pw-current" [error]="passwordErrors().currentPassword">
                <input
                  id="pw-current"
                  class="input"
                  type="password"
                  formControlName="currentPassword"
                  autocomplete="current-password"
                  [attr.aria-invalid]="!!passwordErrors().currentPassword"
                  [attr.aria-describedby]="passwordErrors().currentPassword ? 'pw-current-error' : null"
                />
              </sh-form-field>

              <sh-form-field label="New password" forId="pw-new" hint="At least 8 characters with a letter and a number." [error]="passwordErrors().newPassword">
                <input
                  id="pw-new"
                  class="input"
                  type="password"
                  formControlName="newPassword"
                  autocomplete="new-password"
                  [attr.aria-invalid]="!!passwordErrors().newPassword"
                  [attr.aria-describedby]="passwordErrors().newPassword ? 'pw-new-error' : 'pw-new-hint'"
                />
              </sh-form-field>

              <sh-form-field label="Confirm new password" forId="pw-confirm" [error]="passwordErrors().confirmPassword">
                <input
                  id="pw-confirm"
                  class="input"
                  type="password"
                  formControlName="confirmPassword"
                  autocomplete="new-password"
                  [attr.aria-invalid]="!!passwordErrors().confirmPassword"
                  [attr.aria-describedby]="passwordErrors().confirmPassword ? 'pw-confirm-error' : null"
                />
              </sh-form-field>

              @if (passwordError(); as message) {
                <p class="alert" role="alert" @fadeSlide><sh-icon name="alert" /> {{ message }}</p>
              }

              <button shButton variant="solid" type="submit" [busy]="passwordBusy()" [disabled]="passwordBusy()">
                Update password
              </button>
            </form>
          </section>

          <button shButton variant="danger" type="button" class="logout" (click)="auth.logout()">
            <sh-icon name="logout" /> Sign out
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }

    .page { display: grid; gap: 1.5rem; }
    .intro h1 { margin: 0.4rem 0 0; font-size: var(--fs-h1); letter-spacing: -0.03em; }

    .layout { display: grid; gap: 1.25rem; align-items: start; }
    .col { display: grid; gap: 1.25rem; }

    @media (min-width: 980px) {
      .layout { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
    }

    .section { display: grid; gap: 1.1rem; padding: clamp(1.1rem, 0.9rem + 1vw, 1.6rem); border-radius: var(--radius-card); }
    .section__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }

    h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: var(--fs-h3); }
    h2 sh-icon { width: 20px; height: 20px; color: var(--ember); }

    .form { display: grid; gap: 1.05rem; }
    .label { font-size: var(--fs-sm); font-weight: 600; color: var(--text); }

    .avatar-row { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
    .hue { display: grid; gap: 0.55rem; flex: 1 1 200px; }

    .hue__range {
      width: 100%;
      height: 12px;
      appearance: none;
      border-radius: var(--radius-pill);
      background: linear-gradient(90deg, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 85% 45%), hsl(180 85% 45%), hsl(240 85% 60%), hsl(300 85% 55%), hsl(359 85% 55%));
      cursor: pointer;
    }
    .hue__range::-webkit-slider-thumb {
      appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), var(--glow-sm);
    }
    .hue__range::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 50%; background: #fff; box-shadow: var(--glow-sm); }

    .swatches { display: flex; flex-wrap: wrap; gap: 0.45rem; }
    .swatch {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: linear-gradient(135deg, hsl(var(--h) 90% 62%), hsl(var(--h) 80% 38%));
      cursor: pointer;
      transition: transform 200ms var(--ease-back), border-color 200ms ease;
    }
    .swatch:hover { transform: scale(1.12); }
    .swatch[aria-pressed='true'] { border-color: var(--heading); box-shadow: var(--glow-sm); }

    .input[readonly] { opacity: 0.7; cursor: default; }

    .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }

    .saved { font-size: var(--fs-xs); }

    .stack { display: grid; gap: 0.4rem; }
    .switch span { display: grid; gap: 0.1rem; }
    .switch strong { font-weight: 600; color: var(--heading); font-size: var(--fs-sm); }
    .switch small { font-size: var(--fs-xs); }

    .time { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-left: 0.75rem; border-left: 2px solid rgba(var(--ember-rgb), 0.4); }
    .input--time { width: auto; min-width: 130px; }

    .digest { display: grid; gap: 0.5rem; margin-top: 0.4rem; }

    .segmented button { display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; }
    .segmented sh-icon { width: 16px; height: 16px; }

    .skel-row { height: 44px; border-radius: 14px; }
    .notif-error { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .notif-error p { margin: 0; }

    .logout { justify-self: start; }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly api = inject(ProfileApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly swatches = HUE_SWATCHES;
  protected readonly digests: { value: NotificationSettings['emailDigest']; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
  ];
  protected readonly timezones = listTimezones(this.auth.user()?.timezone);

  // ---- account --------------------------------------------------------------------

  protected readonly account = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(32)]],
    avatarHue: [24],
    timezone: ['UTC'],
  });

  private readonly accountRevision = signal(0);
  protected readonly accountSubmitted = signal(false);
  protected readonly accountBusy = signal(false);
  protected readonly accountError = signal<string | null>(null);

  protected readonly preview = computed(() => {
    this.accountRevision();
    return this.account.getRawValue();
  });

  protected readonly accountDirty = computed(() => {
    const v = this.preview();
    const user = this.auth.user();
    return !!user && (v.displayName.trim() !== user.displayName || Number(v.avatarHue) !== user.avatarHue || v.timezone !== user.timezone);
  });

  protected readonly accountErrors = computed(() => {
    this.accountRevision();
    return { displayName: controlError(this.account.controls.displayName, this.accountSubmitted(), 'Display name') };
  });

  // ---- notifications ----------------------------------------------------------------

  protected readonly notif = signal<NotificationSettings | null>(null);
  protected readonly notifFailed = signal(false);
  protected readonly notifSaving = signal(false);
  protected readonly notifSavedOnce = signal(false);
  private notifSeq = 0;

  // ---- password -------------------------------------------------------------------

  protected readonly password = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  private readonly passwordRevision = signal(0);
  protected readonly passwordSubmitted = signal(false);
  protected readonly passwordBusy = signal(false);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly passwordErrors = computed(() => {
    this.passwordRevision();
    const s = this.passwordSubmitted();
    const c = this.password.controls;
    return {
      currentPassword: controlError(c.currentPassword, s, 'Current password'),
      newPassword: controlError(c.newPassword, s, 'New password'),
      confirmPassword: controlError(c.confirmPassword, s, 'Confirmation'),
    };
  });

  constructor() {
    this.resetAccount();
    this.account.events.pipe(takeUntilDestroyed()).subscribe(() => this.accountRevision.update((n) => n + 1));
    this.password.events.pipe(takeUntilDestroyed()).subscribe(() => this.passwordRevision.update((n) => n + 1));
    this.loadNotifications();
  }

  protected resetAccount(): void {
    const user = this.auth.user();
    if (!user) return;
    this.account.reset({ displayName: user.displayName, avatarHue: user.avatarHue, timezone: user.timezone });
    this.accountSubmitted.set(false);
    this.accountError.set(null);
  }

  protected saveAccount(): void {
    this.accountSubmitted.set(true);
    this.accountError.set(null);
    if (this.account.invalid || this.accountBusy()) {
      this.account.markAllAsTouched();
      return;
    }
    const { displayName, avatarHue, timezone } = this.account.getRawValue();
    this.accountBusy.set(true);
    this.api.update({ displayName: displayName.trim(), avatarHue: Number(avatarHue), timezone }).subscribe({
      next: (user) => {
        this.accountBusy.set(false);
        this.auth.setUser(user);
        this.resetAccount();
        this.toast.success('Profile saved.', { key: 'profile' });
      },
      error: (err: unknown) => {
        this.accountBusy.set(false);
        const error = ApiError.from(err);
        if (!applyServerErrors(this.account, error)) this.accountError.set(error.message);
        this.accountRevision.update((n) => n + 1);
      },
    });
  }

  protected loadNotifications(): void {
    this.notifFailed.set(false);
    this.api.notifications().subscribe({
      next: (settings) => this.notif.set(settings),
      error: () => this.notifFailed.set(true),
    });
  }

  /** Optimistic: the toggle flips immediately and rolls back if the server refuses */
  protected patchNotif(patch: Partial<NotificationSettings>): void {
    const previous = this.notif();
    if (!previous) return;
    const next = { ...previous, ...patch };
    this.notif.set(next);
    this.notifSaving.set(true);
    const seq = ++this.notifSeq;

    this.api.updateNotifications(next).subscribe({
      next: (saved) => {
        if (seq !== this.notifSeq) return;
        this.notif.set(saved);
        this.notifSaving.set(false);
        this.notifSavedOnce.set(true);
      },
      error: () => {
        if (seq !== this.notifSeq) return;
        this.notif.set(previous); // errorInterceptor already told the user why
        this.notifSaving.set(false);
      },
    });
  }

  protected onTime(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(value)) this.patchNotif({ reminderTime: value });
  }

  protected changePassword(): void {
    this.passwordSubmitted.set(true);
    this.passwordError.set(null);
    if (this.password.invalid || this.passwordBusy()) {
      this.password.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.password.getRawValue();
    this.passwordBusy.set(true);
    this.api.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.passwordBusy.set(false);
        this.password.reset();
        this.passwordSubmitted.set(false);
        this.toast.success('Password updated.');
      },
      error: (err: unknown) => {
        this.passwordBusy.set(false);
        const error = ApiError.from(err);
        if (!applyServerErrors(this.password, error)) this.passwordError.set(error.message);
        this.passwordRevision.update((n) => n + 1);
      },
    });
  }
}

function listTimezones(current: string | undefined): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['UTC'];
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}
