import type { HabitFrequency } from '../models/habit.models';

/**
 * Calendar helpers for the mock server. Period keys are "YYYY-MM-DD" in the
 * user's timezone; weekly periods are keyed by their Monday.
 */

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Local wall-clock parts of an instant */
function parts(ms: number, tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(ms)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** tz offset (ms) at an instant: local wall time − UTC */
export function tzOffset(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const wall = Date.UTC(p['year'], p['month'] - 1, p['day'], p['hour'], p['minute'], p['second']);
  return wall - Math.floor(ms / 1000) * 1000;
}

export function dayKey(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p['year']}-${pad(p['month'])}-${pad(p['day'])}`;
}

export function periodKey(ms: number, frequency: HabitFrequency, tz: string): string {
  const day = dayKey(ms, tz);
  if (frequency === 'daily') return day;
  const d = new Date(`${day}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return addDays(day, -mondayOffset);
}

export function prevPeriod(key: string, frequency: HabitFrequency): string {
  return addDays(key, frequency === 'daily' ? -1 : -7);
}

export function nextPeriod(key: string, frequency: HabitFrequency): string {
  return addDays(key, frequency === 'daily' ? 1 : 7);
}

/** Instant at which a period (key) starts in the given timezone */
export function periodStartMs(key: string, tz: string, nowMs: number): number {
  return Date.parse(`${key}T00:00:00Z`) - tzOffset(nowMs, tz);
}

export function addDays(key: string, days: number): string {
  const d = new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
