import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { fadeSlide } from '../../../core/animations/route-animations';
import { ApiError } from '../../../core/http/api-error';
import type { CreateHabitRequest, Habit, HabitFrequency, HabitIcon, HabitKind } from '../../../core/models/habit.models';
import { ToastService } from '../../../core/services/toast.service';
import { ButtonComponent } from '../../../shared/components/button/button';
import { FormFieldComponent } from '../../../shared/components/form-field/form-field';
import { IconComponent } from '../../../shared/components/icon/icon';
import { applyServerErrors, controlError } from '../../../shared/utils/form-errors';
import { HabitsStore } from '../data/habits.store';

interface Preset {
  label: string;
  value: Omit<CreateHabitRequest, 'shared'>;
}

const ICONS: HabitIcon[] = ['run', 'water', 'book', 'meditate', 'code', 'sleep', 'dumbbell', 'leaf', 'mountain'];

const COOLDOWNS: { seconds: number; label: string }[] = [
  { seconds: 0, label: 'No cooldown' },
  { seconds: 60, label: '1 minute' },
  { seconds: 5 * 60, label: '5 minutes' },
  { seconds: 15 * 60, label: '15 minutes' },
  { seconds: 30 * 60, label: '30 minutes' },
  { seconds: 60 * 60, label: '1 hour' },
  { seconds: 2 * 60 * 60, label: '2 hours' },
];

const PRESETS: Preset[] = [
  {
    label: 'Water',
    value: { title: 'Drink water', icon: 'water', kind: 'cumulative', frequency: 'daily', target: 8, unit: 'glasses', cooldownSeconds: 30 * 60 },
  },
  {
    label: 'Morning run',
    value: { title: 'Morning run', icon: 'run', kind: 'binary', frequency: 'daily', target: 1, unit: null, cooldownSeconds: 0 },
  },
  {
    label: 'Deep work',
    value: { title: 'Deep work block', icon: 'code', kind: 'cumulative', frequency: 'daily', target: 4, unit: 'blocks', cooldownSeconds: 60 * 60 },
  },
  {
    label: 'Gym',
    value: { title: 'Gym session', icon: 'dumbbell', kind: 'cumulative', frequency: 'weekly', target: 3, unit: 'sessions', cooldownSeconds: 2 * 60 * 60 },
  },
];

/** Native <dialog> with the "new habit" form. Open with `open()`. */
@Component({
  selector: 'sh-create-habit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, FormFieldComponent, IconComponent],
  animations: [fadeSlide],
  template: `
    <dialog #dialog class="dialog" aria-labelledby="create-habit-title" (close)="onClosed()" (cancel)="onCancel($event)">
      <form class="body" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <header class="head">
          <div>
            <p class="eyebrow">New habit</p>
            <h2 id="create-habit-title">What are you climbing?</h2>
          </div>
          <button shButton variant="ghost" size="sm" iconOnly type="button" aria-label="Close" (click)="close()">
            <sh-icon name="x" />
          </button>
        </header>

        <div class="presets" role="group" aria-label="Quick start">
          @for (preset of presets; track preset.label) {
            <button type="button" class="chip" (click)="applyPreset(preset)">
              <sh-icon [name]="preset.value.icon" /> {{ preset.label }}
            </button>
          }
        </div>

        @if (formError(); as message) {
          <p class="alert" role="alert" @fadeSlide><sh-icon name="alert" /> {{ message }}</p>
        }

        <sh-form-field label="Title" forId="habit-title" [error]="errors().title">
          <input
            id="habit-title"
            class="input"
            formControlName="title"
            maxlength="60"
            placeholder="e.g. Read 20 pages"
            autocomplete="off"
            [attr.aria-invalid]="!!errors().title"
            [attr.aria-describedby]="errors().title ? 'habit-title-error' : null"
          />
        </sh-form-field>

        <fieldset class="group">
          <legend>Icon</legend>
          <div class="icons">
            @for (icon of icons; track icon) {
              <button
                type="button"
                class="icon-btn"
                [attr.aria-pressed]="value().icon === icon"
                [attr.aria-label]="icon"
                (click)="form.controls.icon.setValue(icon)"
              >
                <sh-icon [name]="icon" />
              </button>
            }
          </div>
        </fieldset>

        <div class="row">
          <fieldset class="group">
            <legend>Type</legend>
            <div class="segmented">
              <button type="button" [attr.aria-pressed]="value().kind === 'binary'" (click)="setKind('binary')">Once</button>
              <button type="button" [attr.aria-pressed]="value().kind === 'cumulative'" (click)="setKind('cumulative')">Several times</button>
            </div>
          </fieldset>

          <fieldset class="group">
            <legend>Resets</legend>
            <div class="segmented">
              <button type="button" [attr.aria-pressed]="value().frequency === 'daily'" (click)="setFrequency('daily')">Daily</button>
              <button type="button" [attr.aria-pressed]="value().frequency === 'weekly'" (click)="setFrequency('weekly')">Weekly</button>
            </div>
          </fieldset>
        </div>

        @if (value().kind === 'cumulative') {
          <div class="row" @fadeSlide>
            <sh-form-field label="Target" forId="habit-target" [error]="errors().target">
              <input
                id="habit-target"
                class="input mono"
                type="number"
                inputmode="numeric"
                min="2"
                max="50"
                formControlName="target"
                [attr.aria-invalid]="!!errors().target"
                [attr.aria-describedby]="errors().target ? 'habit-target-error' : null"
              />
            </sh-form-field>
            <sh-form-field label="Unit" forId="habit-unit" hint="Optional" [error]="errors().unit">
              <input id="habit-unit" class="input" formControlName="unit" maxlength="20" placeholder="glasses" autocomplete="off" />
            </sh-form-field>
            <sh-form-field
              class="span"
              label="Cooldown between check-ins"
              forId="habit-cooldown"
              hint="Enforced by the server — no cheating by spamming the button."
              [error]="errors().cooldownSeconds"
            >
              <select id="habit-cooldown" class="select" formControlName="cooldownSeconds">
                @for (c of cooldowns; track c.seconds) {
                  <option [ngValue]="c.seconds">{{ c.label }}</option>
                }
              </select>
            </sh-form-field>
          </div>
        }

        <sh-form-field label="Description" forId="habit-desc" hint="Optional" [error]="errors().description">
          <textarea id="habit-desc" class="textarea" formControlName="description" maxlength="200" rows="2"></textarea>
        </sh-form-field>

        <div class="share">
          <label class="switch">
            <span>
              <strong>Climb with friends</strong>
              <small class="muted">Get an invite link and a shared room.</small>
            </span>
            <input type="checkbox" role="switch" formControlName="shared" />
          </label>

          @if (value().shared) {
            <div class="segmented" role="group" aria-label="Room mode" @fadeSlide>
              <button type="button" [attr.aria-pressed]="value().mode === 'team'" (click)="form.controls.mode.setValue('team')">
                <sh-icon name="users" /> Team
              </button>
              <button type="button" [attr.aria-pressed]="value().mode === 'competitive'" (click)="form.controls.mode.setValue('competitive')">
                <sh-icon name="swords" /> Versus
              </button>
            </div>
          }
        </div>

        <footer class="actions">
          <button shButton variant="ghost" type="button" (click)="close()">Cancel</button>
          <button shButton type="submit" [busy]="busy()" [disabled]="busy()">
            <sh-icon name="plus" /> Create habit
          </button>
        </footer>
      </form>
    </dialog>
  `,
  styles: `
    .body { display: grid; gap: 1.1rem; padding: 1.25rem; }

    @media (min-width: 600px) { .body { padding: 1.75rem; } }

    .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    h2 { margin: 0.25rem 0 0; font-size: var(--fs-h3); }

    .presets { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.2rem; scrollbar-width: none; }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 36px;
      padding: 0.3rem 0.8rem;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--text-soft);
      font-size: var(--fs-xs);
      font-weight: 600;
      white-space: nowrap;
    }

    .chip:hover { border-color: rgba(var(--ember-rgb), 0.6); color: var(--heading); }
    .chip sh-icon { width: 15px; height: 15px; color: var(--ember); }

    .group { display: grid; gap: 0.45rem; min-width: 0; margin: 0; padding: 0; border: 0; }
    legend { padding: 0; margin-bottom: 0.45rem; font-size: var(--fs-sm); font-weight: 600; color: var(--text); }

    .icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 0.4rem; }

    .icon-btn {
      display: grid;
      place-items: center;
      height: 44px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--bg-elev);
      color: var(--text-soft);
      transition: border-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
    }

    .icon-btn:hover { color: var(--heading); }

    .icon-btn[aria-pressed='true'] {
      border-color: var(--ember);
      color: var(--ember);
      box-shadow: var(--glow-sm);
    }

    .row { display: grid; gap: 1rem; }

    @media (min-width: 600px) {
      .row { grid-template-columns: 1fr 1fr; }
      .span { grid-column: 1 / -1; }
    }

    .segmented button { display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; }
    .segmented sh-icon { width: 16px; height: 16px; }

    .share {
      display: grid;
      gap: 0.75rem;
      padding: 0.8rem 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-input);
      background: rgba(var(--ember-rgb), 0.04);
    }

    .switch span { display: grid; gap: 0.15rem; }
    .switch small { font-size: var(--fs-xs); }

    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.6rem; }
  `,
})
export class CreateHabitDialogComponent {
  private readonly store = inject(HabitsStore);
  private readonly toast = inject(ToastService);

  readonly created = output<Habit>();

  protected readonly icons = ICONS;
  protected readonly cooldowns = COOLDOWNS;
  protected readonly presets = PRESETS;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly revision = signal(0);

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    description: ['', [Validators.maxLength(200)]],
    icon: ['leaf' as HabitIcon],
    kind: ['cumulative' as HabitKind],
    frequency: ['daily' as HabitFrequency],
    target: [3, [Validators.required, Validators.min(2), Validators.max(50)]],
    unit: ['', [Validators.maxLength(20)]],
    cooldownSeconds: [5 * 60],
    shared: [false],
    mode: ['team' as 'team' | 'competitive'],
  });

  /** Form value as a signal (reactive forms aren't signal-based yet) */
  protected readonly value = computed(() => {
    this.revision();
    return this.form.getRawValue();
  });

  protected readonly errors = computed(() => {
    this.revision();
    const s = this.submitted();
    const c = this.form.controls;
    return {
      title: controlError(c.title, s, 'Title'),
      description: controlError(c.description, s, 'Description'),
      target: controlError(c.target, s, 'Target'),
      unit: controlError(c.unit, s, 'Unit'),
      cooldownSeconds: controlError(c.cooldownSeconds, s, 'Cooldown'),
    };
  });

  constructor() {
    this.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.revision.update((n) => n + 1));
  }

  open(): void {
    this.reset();
    this.dialog().nativeElement.showModal();
    queueMicrotask(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('#habit-title')?.focus());
  }

  close(): void {
    if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
  }

  protected onCancel(event: Event): void {
    // Don't let Esc drop a request that is already on its way
    if (this.busy()) event.preventDefault();
  }

  protected onClosed(): void {
    this.formError.set(null);
  }

  protected setKind(kind: HabitKind): void {
    this.form.controls.kind.setValue(kind);
    const target = this.form.controls.target;
    // Binary habits have target 1 and no cooldown; the target validators only apply to cumulative ones
    if (kind === 'binary') target.disable();
    else target.enable();
  }

  protected setFrequency(frequency: HabitFrequency): void {
    this.form.controls.frequency.setValue(frequency);
  }

  protected applyPreset(preset: Preset): void {
    const v = preset.value;
    this.form.patchValue({
      title: v.title,
      icon: v.icon,
      frequency: v.frequency,
      target: Math.max(2, v.target),
      unit: v.unit ?? '',
      cooldownSeconds: v.cooldownSeconds,
    });
    this.setKind(v.kind);
  }

  protected submit(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      this.revision.update((n) => n + 1);
      return;
    }

    const v = this.form.getRawValue();
    const cumulative = v.kind === 'cumulative';
    const body: CreateHabitRequest = {
      title: v.title.trim(),
      description: v.description.trim() || undefined,
      icon: v.icon,
      kind: v.kind,
      frequency: v.frequency,
      target: cumulative ? Number(v.target) : 1,
      unit: cumulative ? v.unit.trim() || null : null,
      cooldownSeconds: cumulative ? Number(v.cooldownSeconds) : 0,
      shared: v.shared ? { mode: v.mode } : null,
    };

    this.busy.set(true);
    this.store.create(body).subscribe({
      next: (habit) => {
        this.busy.set(false);
        this.close();
        this.toast.success(
          habit.shared.enabled ? `“${habit.title}” created — open its room to invite friends.` : `“${habit.title}” is on your mountain.`,
        );
        this.created.emit(habit);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const error = ApiError.from(err);
        if (!applyServerErrors(this.form, error)) this.formError.set(error.message);
        this.revision.update((n) => n + 1);
      },
    });
  }

  private reset(): void {
    this.submitted.set(false);
    this.formError.set(null);
    this.form.reset();
    this.form.controls.target.enable();
  }
}
