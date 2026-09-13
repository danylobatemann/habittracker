import type { AbstractControl, FormGroup } from '@angular/forms';

import type { ApiError } from '../../core/http/api-error';

/**
 * First human message for a control — shown once the user left the field
 * or tried to submit. `server` errors come from `applyServerErrors`.
 */
export function controlError(control: AbstractControl | null, submitted: boolean, label = 'This field'): string | null {
  if (!control || !control.errors || !(control.touched || submitted)) return null;
  const e = control.errors;
  if (e['server']) return e['server'] as string;
  if (e['required']) return `${label} is required.`;
  if (e['email']) return 'Enter a valid email address.';
  if (e['minlength']) return `${label} needs at least ${(e['minlength'] as { requiredLength: number }).requiredLength} characters.`;
  if (e['maxlength']) return `${label} can be at most ${(e['maxlength'] as { requiredLength: number }).requiredLength} characters.`;
  if (e['min']) return `${label} must be at least ${(e['min'] as { min: number }).min}.`;
  if (e['max']) return `${label} must be at most ${(e['max'] as { max: number }).max}.`;
  if (e['pattern']) return `${label} has an invalid format.`;
  if (e['mismatch']) return 'Passwords don’t match.';
  if (e['sameAsCurrent']) return 'Choose a password different from the current one.';
  return `${label} is invalid.`;
}

/** Puts server-side field errors onto the matching controls. Returns true if any was applied. */
export function applyServerErrors(form: FormGroup, error: ApiError): boolean {
  let applied = false;
  for (const { field, message } of error.fieldErrors) {
    const control = form.get(field);
    if (!control) continue;
    control.setErrors({ ...(control.errors ?? {}), server: message });
    control.markAsTouched();
    applied = true;
  }
  return applied;
}
