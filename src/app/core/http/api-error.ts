import { HttpErrorResponse } from '@angular/common/http';

import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from '../models/api.models';

/**
 * Normalized error thrown by every API call after `errorInterceptor`.
 * Feature code never has to inspect raw `HttpErrorResponse`s.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fieldErrors: ApiFieldError[] = [],
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  get isServer(): boolean {
    return this.status >= 500;
  }

  /** Field error message for a form control, if the server returned one */
  fieldError(field: string): string | null {
    return this.fieldErrors.find((e) => e.field === field)?.message ?? null;
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the server. Check your connection.');
      }
      const body = isErrorBody(error.error) ? error.error.error : null;
      return new ApiError(
        error.status,
        body?.code ?? fallbackCode(error.status),
        body?.message ?? fallbackMessage(error.status),
        body?.fieldErrors ?? [],
        body?.details ?? {},
      );
    }

    return new ApiError(0, 'UNKNOWN', error instanceof Error ? error.message : 'Something went wrong.');
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

function fallbackCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'VALIDATION_FAILED';
    case 401:
      return 'TOKEN_INVALID';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'UNKNOWN';
  }
}

function fallbackMessage(status: number): string {
  if (status >= 500) return 'The server had a hiccup. Please try again in a moment.';
  if (status === 404) return 'We couldn’t find what you were looking for.';
  if (status === 403) return 'You don’t have access to this.';
  if (status === 429) return 'Slow down a little — too many requests.';
  // Typical answer of a static host to POST /api/… — the bundle was built without a backend
  if (status === 405) return 'The SyncHabit API isn’t available on this server.';
  return 'Something went wrong.';
}
