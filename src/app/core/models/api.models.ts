/**
 * Transport-level contracts shared by every endpoint.
 *
 * Conventions expected from the backend:
 *   • timestamps are ISO-8601 strings in UTC;
 *   • every response carries `X-Server-Time: <epoch ms>` (see server-time.interceptor.ts);
 *   • errors use the `ApiErrorBody` envelope below with a stable machine `code`.
 */

/** ISO-8601 date-time string, e.g. "2026-09-13T08:15:00.000Z" */
export type IsoDateTime = string;

/** Calendar day in the user's timezone, "YYYY-MM-DD" */
export type IsoDate = string;

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'COOLDOWN_ACTIVE'
  | 'DAILY_TARGET_REACHED'
  | 'INVITE_EXPIRED'
  | 'ALREADY_MEMBER'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fieldErrors?: ApiFieldError[];
    /** Code-specific payload, e.g. `{ cooldownEndsAt }` for COOLDOWN_ACTIVE */
    details?: Record<string, unknown>;
  };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** List responses echo the server clock so cooldowns can be rendered without a device-time dependency */
export interface WithServerTime {
  serverTime: IsoDateTime;
}
