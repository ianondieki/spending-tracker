/** Date labels for chart axes and tables, Africa/Nairobi calendar dates, both locales. */
import type { Locale } from '@hesabu/report-model';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SW = ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'];
const WEEKDAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_SW = ['Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi', 'Jumapili'];

export function weekdayIndex(date: string): number {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  return (d.getUTCDay() + 6) % 7;
}

export function monthName(date: string, locale: Locale): string {
  return (locale === 'sw' ? MONTHS_SW : MONTHS_EN)[+date.slice(5, 7) - 1] ?? '';
}

export function weekdayName(date: string, locale: Locale): string {
  return (locale === 'sw' ? WEEKDAYS_SW : WEEKDAYS_EN)[weekdayIndex(date)] ?? '';
}

/** "9 Oct" / "9 Okt" */
export function shortDate(date: string, locale: Locale): string {
  return `${+date.slice(8, 10)} ${monthName(date, locale).slice(0, 3)}`;
}

/** "Friday 9 October" / "Ijumaa 9 Oktoba" */
export function longDate(date: string, locale: Locale): string {
  return `${weekdayName(date, locale)} ${+date.slice(8, 10)} ${monthName(date, locale)}`;
}

/** Three-letter weekday for weekly bar labels. */
export function weekdayShort(date: string, locale: Locale): string {
  return weekdayName(date, locale).slice(0, 3);
}
