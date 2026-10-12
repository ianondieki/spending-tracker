/**
 * Normalisers from PROVIDER-PACKS.md §4. Each returns `null` when the captured text cannot be normalised, which the
 * engine treats as a missing group (fatal for a required field, null for an optional one). Nothing here guesses:
 * an amount with three decimals or a date that matches no format is a failure, never a rounded value.
 */

const NAIROBI_OFFSET_MINUTES = 3 * 60; // Africa/Nairobi is UTC+3 all year, no DST.

export function normaliseText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

export function normaliseCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(code) ? code : null;
}

export function normaliseDigits(raw: string): string | null {
  const digits = raw.replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
}

/**
 * Strips one amount prefix (longest first, case-insensitive), commas and spaces, then parses a decimal with at most
 * two places. `Ksh1,200.00` → 120000, `KES 50` → 5000, `Ksh.0.00` with prefix `Ksh.` → 0.
 */
export function normaliseAmount(raw: string, prefixes: readonly string[]): number | null {
  let text = raw.trim();
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  for (const prefix of sorted) {
    if (prefix.length > 0 && lower.startsWith(prefix.toLowerCase())) {
      text = text.slice(prefix.length);
      break;
    }
  }
  text = text.replace(/[,\s]+/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  if (!Number.isSafeInteger(whole * 100 + frac)) return null;
  return whole * 100 + frac;
}

/**
 * Keeps digits (and the masking placeholders `X` and `*` that a redacted or provider-masked number already carries),
 * turns a leading `+254` / `254` into `0`, then masks to the first 2 and last 3 characters: `0722358700` →
 * `07XXXXX700`. Numbers of five characters or fewer are returned unmasked.
 */
export function normalisePhone(raw: string): string | null {
  let text = raw.replace(/[^0-9Xx*]+/g, '').replace(/[x*]/g, 'X');
  if (text.length === 0) return null;
  if (text.startsWith('254')) text = `0${text.slice(3)}`;
  return maskMiddle(text);
}

export function maskMiddle(text: string): string {
  if (text.length <= 5) return text;
  return `${text.slice(0, 2)}${'X'.repeat(text.length - 5)}${text.slice(-3)}`;
}

/**
 * The account reference typed by the payer may identify a person (a phone number, an ID). The transaction schema
 * asks for it to be masked when it looks like one; a reference of six or more digits keeps only its last three.
 */
export function maskAccountRef(text: string): string {
  const compact = text.replace(/\s+/g, '');
  if (/^(?:\+?254|0)\d{9}$/.test(compact)) return normalisePhone(compact) ?? text;
  return text.replace(/\d{6,}/g, (run) => `${'X'.repeat(run.length - 3)}${run.slice(-3)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

type Token = 'd' | 'dd' | 'M' | 'MM' | 'MMM' | 'yy' | 'yyyy' | 'H' | 'HH' | 'h' | 'hh' | 'mm' | 'a';
const TOKEN_REGEX: Record<Token, string> = {
  d: '(\\d{1,2})',
  dd: '(\\d{2})',
  M: '(\\d{1,2})',
  MM: '(\\d{2})',
  MMM: '([A-Za-z]{3})',
  yy: '(\\d{2})',
  yyyy: '(\\d{4})',
  H: '(\\d{1,2})',
  HH: '(\\d{2})',
  h: '(\\d{1,2})',
  hh: '(\\d{2})',
  mm: '(\\d{2})',
  a: '(AM|PM|A\\.M\\.|P\\.M\\.)',
};
const TOKENS: readonly Token[] = [
  'yyyy',
  'MMM',
  'MM',
  'HH',
  'hh',
  'mm',
  'dd',
  'yy',
  'd',
  'M',
  'H',
  'h',
  'a',
];

interface CompiledFormat {
  readonly regex: RegExp;
  readonly tokens: readonly Token[];
}

const formatCache = new Map<string, CompiledFormat>();

/**
 * Compiles a `datetime_formats` entry. Tokens: d dd M MM MMM yy yyyy H HH h hh mm a. Text inside single quotes is
 * literal (`'at'`); any other non-token character is literal too; a space matches any run of whitespace.
 */
export function compileDatetimeFormat(format: string): CompiledFormat {
  const cached = formatCache.get(format);
  if (cached) return cached;
  const tokens: Token[] = [];
  let out = '^';
  let i = 0;
  while (i < format.length) {
    const c = format[i]!;
    if (c === "'") {
      const close = format.indexOf("'", i + 1);
      if (close < 0) throw new Error(`unterminated quote in datetime format "${format}"`);
      out += escapeLiteral(format.slice(i + 1, close));
      i = close + 1;
      continue;
    }
    if (c === ' ') {
      out += '\\s+';
      i += 1;
      continue;
    }
    const token = TOKENS.find((t) => format.startsWith(t, i));
    if (token) {
      tokens.push(token);
      out += TOKEN_REGEX[token];
      i += token.length;
      continue;
    }
    if (/[A-Za-z]/.test(c))
      throw new Error(`unknown token "${c}" in datetime format "${format}"; quote literals`);
    out += escapeLiteral(c);
    i += 1;
  }
  out += '$';
  const compiled = { regex: new RegExp(out, 'i'), tokens };
  formatCache.set(format, compiled);
  return compiled;
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s+');
}

/**
 * Tries each format in order and returns ISO 8601 in Africa/Nairobi (`+03:00`). Two-digit years map to 2000–2099.
 * Missing time parts default to 00:00. Invalid calendar dates (31/2/26) fail.
 */
export function normaliseDatetime(raw: string, formats: readonly string[]): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  for (const format of formats) {
    const { regex, tokens } = compileDatetimeFormat(format);
    const m = regex.exec(text);
    if (!m) continue;
    const parts: Partial<Record<Token, string>> = {};
    tokens.forEach((t, idx) => {
      parts[t] = m[idx + 1];
    });
    const result = assemble(parts);
    if (result) return result;
  }
  return null;
}

function assemble(p: Partial<Record<Token, string>>): string | null {
  const day = Number(p.d ?? p.dd);
  let month: number;
  if (p.MMM !== undefined) {
    const idx = MONTHS.indexOf(p.MMM.toLowerCase());
    if (idx < 0) return null;
    month = idx + 1;
  } else {
    month = Number(p.M ?? p.MM);
  }
  let year: number;
  if (p.yyyy !== undefined) year = Number(p.yyyy);
  else if (p.yy !== undefined) year = 2000 + Number(p.yy);
  else return null;
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;

  let hour = 0;
  if (p.H !== undefined || p.HH !== undefined) {
    hour = Number(p.H ?? p.HH);
  } else if (p.h !== undefined || p.hh !== undefined) {
    hour = Number(p.h ?? p.hh);
    if (hour < 1 || hour > 12) return null;
    const pm = (p.a ?? '').toUpperCase().startsWith('P');
    if (p.a === undefined) return null;
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  const minute = Number(p.mm ?? '0');
  if (hour > 23 || minute > 59) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const offset = NAIROBI_OFFSET_MINUTES;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
