/**
 * Deterministic fact-checker (no model call). Every numeral in every copy string of a report must be a display
 * string from the facts sheet, verbatim. Dates, period labels and names from the sheet are the only other
 * places a digit may appear.
 *
 * Order of work per string:
 *   1. URLs, period labels and other label-like display strings, and names from the sheet that contain digits
 *      are masked (they are facts, not claims).
 *   2. ISO dates/times, clock times, and day numbers next to a month name are masked.
 *   3. Money tokens (`KSh` + optional sign + digits with commas) and percent tokens (`-?\d+%`) must each equal a
 *      display string.
 *   4. Every other bare numeral must equal a display string or be a year 1900–2099.
 * Violations are reported as "<where>: <token>".
 */
import { type FactsSheet } from '@hesabu/analytics';

import { type Section } from './contracts/report-document.js';

export interface FactCheckResult {
  readonly passed: boolean;
  readonly violations: string[];
}

/** The copy-bearing parts of a report (a `ReportDocument` or a draft without `meta`). */
export interface CheckableDocument {
  readonly title: string;
  readonly period_label: string;
  readonly sections: readonly Section[];
  readonly whatsapp: { readonly caption: string };
  readonly email: { readonly subject: string; readonly preheader: string };
}

export interface CopyString {
  readonly where: string;
  readonly text: string;
}

/** Every copy string in the document, labelled with where it sits. */
export function collectCopy(doc: CheckableDocument): CopyString[] {
  const out: CopyString[] = [];
  const add = (where: string, text: string | null | undefined): void => {
    if (typeof text === 'string' && text.length > 0) out.push({ where, text });
  };
  add('title', doc.title);
  add('period_label', doc.period_label);
  doc.sections.forEach((section, i) => {
    const at = `sections[${i}].${section.type}`;
    switch (section.type) {
      case 'hero':
        add(`${at}.total_out`, section.total_out);
        add(`${at}.delta`, section.delta);
        add(`${at}.verdict`, section.verdict);
        section.tally.forEach((row, j) => {
          add(`${at}.tally[${j}].label`, row.label);
          add(`${at}.tally[${j}].value`, row.value);
        });
        break;
      case 'kpis':
        section.items.forEach((item, j) => {
          add(`${at}.items[${j}].label`, item.label);
          add(`${at}.items[${j}].value`, item.value);
          add(`${at}.items[${j}].delta`, item.delta);
        });
        break;
      case 'chart':
        add(`${at}(${section.chart_id}).title`, section.title);
        add(`${at}(${section.chart_id}).takeaway`, section.takeaway);
        add(`${at}(${section.chart_id}).alt_text`, section.alt_text);
        break;
      case 'insights':
        add(`${at}.title`, section.title);
        section.items.forEach((item, j) => {
          add(`${at}.items[${j}].headline`, item.headline);
          add(`${at}.items[${j}].body`, item.body);
        });
        break;
      case 'table':
        add(`${at}.title`, section.title);
        section.columns.forEach((c, j) => add(`${at}.columns[${j}]`, c));
        section.rows.forEach((row, r) =>
          row.forEach((cell, c) => add(`${at}.rows[${r}][${c}]`, cell)),
        );
        (section.total_row ?? []).forEach((cell, c) => add(`${at}.total_row[${c}]`, cell));
        break;
      case 'list':
        add(`${at}.title`, section.title);
        section.items.forEach((item, j) => add(`${at}.items[${j}]`, item));
        break;
      case 'callout':
        add(`${at}.body`, section.body);
        break;
      case 'watch':
        add(`${at}.title`, section.title);
        section.items.forEach((item, j) => add(`${at}.items[${j}]`, item));
        break;
      case 'footer':
        section.accounts_covered.forEach((a, j) => add(`${at}.accounts_covered[${j}]`, a));
        add(`${at}.computed_note`, section.computed_note);
        add(`${at}.unknown_count`, section.unknown_count);
        break;
    }
  });
  add('whatsapp.caption', doc.whatsapp.caption);
  add('email.subject', doc.email.subject);
  add('email.preheader', doc.email.preheader);
  return out;
}

const MONTHS = [
  // English, full and short
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
  // Kiswahili, full and short
  'Januari',
  'Februari',
  'Machi',
  'Aprili',
  'Mei',
  'Juni',
  'Julai',
  'Agosti',
  'Septemba',
  'Oktoba',
  'Novemba',
  'Desemba',
  'Mac',
  'Ago',
  'Okt',
  'Des',
];
const MONTH_ALT = [...new Set(MONTHS)].sort((a, b) => b.length - a.length).join('|');

const URL = /\bhttps?:\/\/[^\s)>\]]+/gi;
const ISO_DATE =
  /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?!\d)/g;
const CLOCK = /(?<![\d:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\d:])/g;
const DAY_BEFORE_MONTH = new RegExp(
  `(?<![\\d.,])(\\d{1,2})(st|nd|rd|th)?(\\s+(?:of\\s+)?)(?=(?:${MONTH_ALT})\\b)`,
  'g',
);
const DAY_AFTER_MONTH = new RegExp(
  `\\b((?:${MONTH_ALT})\\.?\\s+)(\\d{1,2})(st|nd|rd|th)?(?![\\d,]*\\d)`,
  'g',
);
const MONEY = /KSh\s?[+-]?\d[\d,]*(?:\.\d+)?/g;
const PERCENT = /(?<![\d.,])-?\d+(?:\.\d+)?%/g;
const BARE = /\d+(?:,\d{3})*(?:\.\d+)?/g;

/** True for a string that is exactly one money, percent or bare-number token. */
function isPlainToken(s: string): boolean {
  return (
    /^KSh\s?[+-]?\d[\d,]*(?:\.\d+)?$/.test(s) ||
    /^-?\d+(?:\.\d+)?%$/.test(s) ||
    /^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(s)
  );
}

export interface AllowList {
  /** Display strings, verbatim. */
  readonly tokens: ReadonlySet<string>;
  /** Strings containing digits that are masked wherever they appear whole (labels, names), longest first. */
  readonly masks: readonly string[];
}

/** Names in the sheet (merchants, people, accounts, categories, sources); only the ones with digits matter. */
function namesIn(facts: FactsSheet): string[] {
  const names: (string | null | undefined)[] = [
    facts.user.display_name,
    facts.period.label_en,
    facts.period.label_sw,
    facts.previous_period.label_en,
    facts.previous_period.label_sw,
    ...facts.categories.flatMap((c) => [c.name_en, c.name_sw, c.top_merchant]),
    ...facts.merchants.map((m) => m.name),
    ...facts.people.flatMap((p) => [p.name, p.ref_masked]),
    ...facts.accounts.flatMap((a) => [a.label, a.provider]),
    ...facts.income.map((i) => i.source),
    ...facts.largest.map((t) => t.counterparty),
    ...facts.new_merchants,
    ...facts.recurring.map((r) => r.merchant),
    ...facts.trend_months.flatMap((m) => [m.label_en, m.label_sw]),
  ];
  const NAME_PARAMS = [
    'merchant',
    'counterparty',
    'top_person',
    'top_source',
    'account',
    'category_en',
    'category_sw',
  ];
  for (const insight of facts.candidate_insights) {
    for (const key of NAME_PARAMS) {
      const v = insight.params[key];
      if (typeof v === 'string') names.push(v);
    }
  }
  return names.filter((n): n is string => typeof n === 'string');
}

export function buildAllowList(facts: FactsSheet): AllowList {
  const tokens = new Set(facts.display_strings);
  const masks = new Set<string>();
  for (const s of [...facts.display_strings, ...namesIn(facts)]) {
    const trimmed = s.trim();
    if (trimmed.length >= 2 && /\d/.test(trimmed) && !isPlainToken(trimmed)) masks.add(trimmed);
  }
  return { tokens, masks: [...masks].sort((a, b) => b.length - a.length) };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Blanks every whole-word occurrence of `needle` in `text`. */
function maskWhole(text: string, needle: string): string {
  let out = text;
  let from = 0;
  for (;;) {
    const at = out.indexOf(needle, from);
    if (at < 0) return out;
    const before = at > 0 ? out.charAt(at - 1) : '';
    const after = out.charAt(at + needle.length);
    const boundedLeft = before === '' || !WORD_CHAR.test(before);
    const boundedRight = after === '' || !WORD_CHAR.test(after);
    if (boundedLeft && boundedRight) {
      out = `${out.slice(0, at)} ${out.slice(at + needle.length)}`;
      from = at + 1;
    } else {
      from = at + 1;
    }
  }
}

function validIsoParts(y: string, m: string, d: string, hh?: string, mm?: string): boolean {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!(year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31))
    return false;
  if (hh !== undefined && mm !== undefined) return Number(hh) <= 23 && Number(mm) <= 59;
  return true;
}

/** The tokens in `text` that the allow-list does not cover (in order of appearance, per kind). */
export function unsupportedTokens(text: string, allow: AllowList): string[] {
  let s = text.replace(URL, ' ');
  for (const mask of allow.masks) s = maskWhole(s, mask);
  s = s.replace(
    ISO_DATE,
    (m: string, y: string, mo: string, d: string, hh?: string, mi?: string) =>
      validIsoParts(y, mo, d, hh, mi) ? ' ' : m,
  );
  s = s.replace(CLOCK, ' ');
  s = s.replace(
    DAY_BEFORE_MONTH,
    (m: string, day: string, _suffix: string | undefined, gap: string) =>
      Number(day) >= 1 && Number(day) <= 31 ? ` ${gap}` : m,
  );
  s = s.replace(DAY_AFTER_MONTH, (m: string, month: string, day: string) =>
    Number(day) >= 1 && Number(day) <= 31 ? `${month} ` : m,
  );

  const bad: string[] = [];
  s = s.replace(MONEY, (raw: string) => {
    const token = raw.replace(/,+$/, '');
    if (!allow.tokens.has(token)) bad.push(token);
    return ' ';
  });
  s = s.replace(PERCENT, (token: string) => {
    if (!allow.tokens.has(token)) bad.push(token);
    return ' ';
  });
  for (const m of s.matchAll(BARE)) {
    const token = m[0];
    if (allow.tokens.has(token)) continue;
    if (/^\d{4}$/.test(token) && Number(token) >= 1900 && Number(token) <= 2099) continue;
    bad.push(token);
  }
  return bad;
}

/** Checks every copy string of `doc` against `facts`. Deterministic; no model involved. */
export function factCheck(doc: CheckableDocument, facts: FactsSheet): FactCheckResult {
  const allow = buildAllowList(facts);
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const { where, text } of collectCopy(doc)) {
    for (const token of unsupportedTokens(text, allow)) {
      const v = `${where}: ${token}`;
      if (!seen.has(v)) {
        seen.add(v);
        violations.push(v);
      }
    }
  }
  return { passed: violations.length === 0, violations };
}
