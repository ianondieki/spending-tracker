/**
 * Report schedule arithmetic shared by the API (next_report_at in sync responses) and the worker's scheduler.
 */
/**
 * Report schedule arithmetic in Africa/Nairobi (UTC+03:00, no daylight saving). `weekly_at` is
 * "SUN 19:30"; `monthly_at` is "1 07:30" (day of month and time).
 */
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseTime(s: string): { hour: number; minute: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

function parseWeekly(spec: string): { dow: number; hour: number; minute: number } | null {
  const [day, time] = spec.trim().toUpperCase().split(/\s+/);
  const dow = day ? DAYS.indexOf(day) : -1;
  const t = time ? parseTime(time) : null;
  return dow < 0 || !t ? null : { dow, ...t };
}

function parseMonthly(spec: string): { day: number; hour: number; minute: number } | null {
  const [dayStr, time] = spec.trim().split(/\s+/);
  const day = Number(dayStr);
  const t = time ? parseTime(time) : null;
  return !Number.isInteger(day) || day < 1 || day > 31 || !t ? null : { day, ...t };
}

/** Next weekly slot strictly after `now`. */
export function nextWeeklyRun(spec: string, now: Date): Date | null {
  const p = parseWeekly(spec);
  if (!p) return null;
  const local = new Date(now.getTime() + OFFSET_MS);
  for (let add = 0; add <= 7; add += 1) {
    const candidate = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, p.hour, p.minute) - OFFSET_MS;
    if (new Date(candidate + OFFSET_MS).getUTCDay() === p.dow && candidate > now.getTime()) return new Date(candidate);
  }
  return null;
}

/** Most recent weekly slot at or before `now`. */
export function lastWeeklyRun(spec: string, now: Date): Date | null {
  const p = parseWeekly(spec);
  if (!p) return null;
  const local = new Date(now.getTime() + OFFSET_MS);
  for (let back = 0; back <= 7; back += 1) {
    const candidate = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back, p.hour, p.minute) - OFFSET_MS;
    if (new Date(candidate + OFFSET_MS).getUTCDay() === p.dow && candidate <= now.getTime()) return new Date(candidate);
  }
  return null;
}

/** Next monthly slot strictly after `now`; day 29–31 clamps to the month's last day. */
export function nextMonthlyRun(spec: string, now: Date): Date | null {
  const p = parseMonthly(spec);
  if (!p) return null;
  const local = new Date(now.getTime() + OFFSET_MS);
  for (let add = 0; add <= 2; add += 1) {
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth() + add;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const candidate = Date.UTC(y, m, Math.min(p.day, lastDay), p.hour, p.minute) - OFFSET_MS;
    if (candidate > now.getTime()) return new Date(candidate);
  }
  return null;
}

/** Most recent monthly slot at or before `now`. */
export function lastMonthlyRun(spec: string, now: Date): Date | null {
  const p = parseMonthly(spec);
  if (!p) return null;
  const local = new Date(now.getTime() + OFFSET_MS);
  for (let back = 0; back <= 2; back += 1) {
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth() - back;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const candidate = Date.UTC(y, m, Math.min(p.day, lastDay), p.hour, p.minute) - OFFSET_MS;
    if (candidate <= now.getTime()) return new Date(candidate);
  }
  return null;
}

export function nextReportAt(prefs: { weekly_at: string; monthly_at: string }, now: Date): Date | null {
  const w = nextWeeklyRun(prefs.weekly_at, now);
  const m = nextMonthlyRun(prefs.monthly_at, now);
  if (!w) return m;
  if (!m) return w;
  return w < m ? w : m;
}
