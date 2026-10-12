/**
 * Report periods in Africa/Nairobi (UTC+03:00, no daylight saving, so the arithmetic is exact without a
 * time-zone library). `start` is inclusive, `end` is exclusive (the first instant of the next period), both
 * serialised with the +03:00 offset. Weeks start on Monday unless the user chose Sunday.
 */
import type { Period } from './contracts/facts-sheet.js';

export const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
export const TIMEZONE = 'Africa/Nairobi' as const;

export type WeekStart = 'monday' | 'sunday';
export type PeriodKind = 'week' | 'month';

/** A calendar date in Nairobi. */
export interface LocalDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const MONTHS_SW = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
] as const;
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAYS_SW = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'] as const;

export function monthNameEn(month: number): string {
  return MONTHS_EN[month - 1] ?? '';
}
export function monthNameSw(month: number): string {
  return MONTHS_SW[month - 1] ?? '';
}

/** Instant (ms since epoch or ISO string) to the Nairobi calendar date. */
export function toLocalDate(instant: number | string | Date): LocalDate {
  const ms = typeof instant === 'number' ? instant : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new TypeError(`toLocalDate: invalid instant ${String(instant)}`);
  const d = new Date(ms + NAIROBI_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Nairobi hour (0-23) of an instant. */
export function localHour(instant: number | string | Date): number {
  const ms = typeof instant === 'number' ? instant : new Date(instant).getTime();
  return new Date(ms + NAIROBI_OFFSET_MS).getUTCHours();
}

/** Midnight at the start of a Nairobi date, as epoch ms. */
export function localMidnightMs(date: LocalDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) - NAIROBI_OFFSET_MS;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function weekdayNameEn(date: LocalDate): string {
  return WEEKDAYS_EN[weekday(date)] ?? '';
}
export function weekdayNameSw(date: LocalDate): string {
  return WEEKDAYS_SW[weekday(date)] ?? '';
}

export function isWeekend(date: LocalDate): boolean {
  const w = weekday(date);
  return w === 0 || w === 6;
}

export function isoDate(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

export function parseIsoDate(s: string): LocalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new TypeError(`parseIsoDate: not a date: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** ISO 8601 with the +03:00 offset for midnight at the start of a Nairobi date. */
export function isoMidnight(date: LocalDate): string {
  return `${isoDate(date)}T00:00:00+03:00`;
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return daysBetween(b, a);
}

/** First day of the week containing `date`. */
export function startOfWeek(date: LocalDate, weekStart: WeekStart = 'monday'): LocalDate {
  const w = weekday(date);
  const offset = weekStart === 'monday' ? (w + 6) % 7 : w;
  return addDays(date, -offset);
}

export function startOfMonth(date: LocalDate): LocalDate {
  return { year: date.year, month: date.month, day: 1 };
}

/** Human labels: "6 to 12 October 2026", "28 September to 4 October 2026", "October 2026". */
export function labelEn(kind: PeriodKind, first: LocalDate, last: LocalDate): string {
  if (kind === 'month') return `${monthNameEn(first.month)} ${first.year}`;
  if (first.year !== last.year) {
    return `${first.day} ${monthNameEn(first.month)} ${first.year} to ${last.day} ${monthNameEn(last.month)} ${last.year}`;
  }
  if (first.month !== last.month) {
    return `${first.day} ${monthNameEn(first.month)} to ${last.day} ${monthNameEn(last.month)} ${last.year}`;
  }
  return `${first.day} to ${last.day} ${monthNameEn(first.month)} ${first.year}`;
}

export function labelSw(kind: PeriodKind, first: LocalDate, last: LocalDate): string {
  if (kind === 'month') return `${monthNameSw(first.month)} ${first.year}`;
  if (first.year !== last.year) {
    return `${first.day} ${monthNameSw(first.month)} ${first.year} hadi ${last.day} ${monthNameSw(last.month)} ${last.year}`;
  }
  if (first.month !== last.month) {
    return `${first.day} ${monthNameSw(first.month)} hadi ${last.day} ${monthNameSw(last.month)} ${last.year}`;
  }
  return `${first.day} hadi ${last.day} ${monthNameSw(first.month)} ${first.year}`;
}

export interface PeriodOptions {
  readonly weekStart?: WeekStart;
  /** "now" for days_elapsed; defaults to the real clock. */
  readonly now?: number | string | Date;
}

/** The period of `kind` containing the Nairobi date `anchor`. */
export function periodContaining(kind: PeriodKind, anchor: LocalDate, opts: PeriodOptions = {}): Period {
  const first = kind === 'week' ? startOfWeek(anchor, opts.weekStart ?? 'monday') : startOfMonth(anchor);
  const nextFirst = kind === 'week' ? addDays(first, 7) : addMonths(first, 1);
  const last = addDays(nextFirst, -1);
  const days = daysBetween(first, nextFirst);
  const today = toLocalDate(opts.now ?? Date.now());
  const elapsedRaw = daysBetween(first, today) + 1;
  const days_elapsed = Math.max(0, Math.min(days, elapsedRaw));
  return {
    kind,
    start: isoMidnight(first),
    end: isoMidnight(nextFirst),
    label_en: labelEn(kind, first, last),
    label_sw: labelSw(kind, first, last),
    days,
    days_elapsed,
    timezone: TIMEZONE,
  };
}

/** The period immediately before `period`. */
export function previousPeriod(period: Period, opts: PeriodOptions = {}): Period {
  const first = parseIsoDate(period.start);
  const prevAnchor = addDays(first, -1);
  return periodContaining(period.kind, prevAnchor, opts);
}

export type PeriodSpec = 'last_week' | 'last_month' | 'current' | string;

/**
 * Resolves the API's `period` field ("last_week" | "last_month" | "current" | an ISO date inside the period)
 * for a report kind to a concrete period. `last_week` and `last_month` are the most recent complete period.
 */
export function resolvePeriod(kind: 'weekly' | 'monthly', spec: PeriodSpec, opts: PeriodOptions = {}): Period {
  const pkind: PeriodKind = kind === 'weekly' ? 'week' : 'month';
  const today = toLocalDate(opts.now ?? Date.now());
  if (spec === 'current') return periodContaining(pkind, today, opts);
  if (spec === 'last_week' || spec === 'last_month') {
    const current = periodContaining(pkind, today, opts);
    return previousPeriod(current, opts);
  }
  return periodContaining(pkind, parseIsoDate(spec), opts);
}

/** True when `instant` falls inside [period.start, period.end). */
export function inPeriod(period: Period, instant: number | string | Date): boolean {
  const ms = typeof instant === 'number' ? instant : new Date(instant).getTime();
  return ms >= new Date(period.start).getTime() && ms < new Date(period.end).getTime();
}
