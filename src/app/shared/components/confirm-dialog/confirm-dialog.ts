import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';

import { ButtonComponent, type ButtonVariant } from '../button/button';

/**
 * Promise-based confirmation on a native <dialog> (focus trap, Esc and
 * backdrop handling come from the platform).
 *
 *   <sh-confirm-dialog #confirm heading="Delete habit?" confirmLabel="Delete" />
 *   if (await confirm.ask()) …
 */
@Component({
  selector: 'sh-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  template: `
    <dialog #dialog class="dialog" [attr.aria-labelledby]="id + '-title'" (close)="onClose()" (click)="onBackdrop($event)">
      <form method="dialog" class="body">
        <h2 [id]="id + '-title'">{{ heading() }}</h2>
        @if (message()) {
          <p class="muted">{{ message() }}</p>
        }
        <div class="actions">
          <button shButton variant="ghost" value="cancel" autofocus>{{ cancelLabel() }}</button>
          <button shButton [variant]="confirmVariant()" value="confirm">{{ confirmLabel() }}</button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .dialog { width: min(420px, calc(100vw - 1.5rem)); }
    .body { display: grid; gap: 0.9rem; padding: 1.5rem; }
    h2 { margin: 0; font-size: var(--fs-h3); }
    p { margin: 0; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.6rem; margin-top: 0.5rem; }
  `,
})
export class ConfirmDialogComponent {
  readonly heading = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly confirmVariant = input<ButtonVariant>('danger');

  private static seq = 0;
  protected readonly id = `confirm-${++ConfirmDialogComponent.seq}`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private resolve: ((ok: boolean) => void) | null = null;

  ask(): Promise<boolean> {
    const el = this.dialog().nativeElement;
    this.resolve?.(false);
    el.returnValue = '';
    if (!el.open) el.showModal();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  protected onClose(): void {
    this.resolve?.(this.dialog().nativeElement.returnValue === 'confirm');
    this.resolve = null;
  }

  /** Click on the backdrop (the dialog element itself, outside the form) cancels */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close('cancel');
  }
}
