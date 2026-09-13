/** 83_000 → "1:23", 3_723_000 → "1:02:03". Rounds up so "0:00" only shows when truly done. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Short human duration for screen readers and hints: "45 seconds", "25 minutes", "1 h 30 min" */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? '' : 's'}`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago" — relative to the server clock */
export function formatRelative(iso: string | null, nowMs: number): string {
  if (!iso) return 'never';
  const delta = nowMs - Date.parse(iso);
  // Future timestamps (invite expiry, streak deadlines) read "in 3 h"
  const label = (value: string) => (delta < 0 ? `in ${value}` : `${value} ago`);
  const s = Math.floor(Math.abs(delta) / 1000);
  // Small skew between server and client clocks shouldn't read as "in the future"
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return label(`${m} min`);
  const h = Math.round(m / 60);
  if (h < 24) return label(`${h} h`);
  const d = Math.round(h / 24);
  return label(`${d} d`);
}
