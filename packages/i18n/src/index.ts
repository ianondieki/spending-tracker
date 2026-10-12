import en from './locales/en.json' with { type: 'json' };
import sw from './locales/sw.json' with { type: 'json' };

export const LOCALES = ['en', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof en;

const catalogs: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en, sw };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Looks a message up by key; falls back to English so a missing translation never blanks a report. */
export function t(locale: Locale, key: MessageKey): string {
  return catalogs[locale][key] ?? catalogs.en[key];
}
