/**
 * Next report run for a user in Africa/Nairobi. `weekly_at` is "SUN 19:30"; `monthly_at` is "1 07:30"
 * (day of month and time). Nairobi has no daylight saving, so the arithmetic is exact at +03:00.
 */
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseTime(s: string): { hour: number; minute: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** Next instant strictly after `now` matching "DAY HH:MM" in Nairobi. Null when the spec is malformed. */
export function nextWeeklyRun(spec: string, now: Date): Date | null {
  const [day, time] = spec.trim().toUpperCase().split(/\s+/);
  const dow = day ? DAYS.indexOf(day) : -1;
  const t = time ? parseTime(time) : null;
  if (dow < 0 || !t) return null;
  const local = new Date(now.getTime() + OFFSET_MS);
  for (let add = 0; add <= 7; add += 1) {
    const candidate = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, t.hour, t.minute) - OFFSET_MS;
    if (new Date(candidate + OFFSET_MS).getUTCDay() === dow && candidate > now.getTime()) return new Date(candidate);
  }
  return null;
}

/** Next instant strictly after `now` matching "D HH:MM" in Nairobi; day 29–31 clamps to the month's last day. */
export function nextMonthlyRun(spec: string, now: Date): Date | null {
  const [dayStr, time] = spec.trim().split(/\s+/);
  const day = Number(dayStr);
  const t = time ? parseTime(time) : null;
  if (!Number.isInteger(day) || day < 1 || day > 31 || !t) return null;
  const local = new Date(now.getTime() + OFFSET_MS);
  for (let add = 0; add <= 2; add += 1) {
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth() + add;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const candidate = Date.UTC(y, m, Math.min(day, lastDay), t.hour, t.minute) - OFFSET_MS;
    if (candidate > now.getTime()) return new Date(candidate);
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
