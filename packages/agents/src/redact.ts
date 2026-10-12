/**
 * Masks identifiers in message text before it is sent to a model (P2: raw messages never leave the phone; the
 * phone redacts first and this runs again server-side as belt and braces). Names after "from"/"to"/"sent to"
 * and amounts are left in place: the extractor needs them.
 *
 *   emails                         → [EMAIL]
 *   Kenyan phone numbers           → first 2 and last 3 digits kept: 0712345678 → 07XXXXX678
 *   M-Pesa style codes (10 A-Z0-9) → [CODE]
 *   digit runs of 9 or more        → [ACCOUNT]
 *   digit runs of 7 or 8           → [ID]   (national ID numbers)
 *
 * A digit run that is an amount (after Ksh/KES/Sh, or with a decimal part, or grouped with commas) is never
 * masked.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** 07XX XXX XXX, 01XX XXX XXX, +254 7XX…, 2547…, with optional single spaces or dashes between digit groups. */
const PHONE = /(?<![\d+])(\+?254[ -]?|0)([17](?:[ -]?\d){8})(?![\d])/g;

/**
 * Ten uppercase letters/digits with at least one of each, e.g. RJK3H5T2QW (all-letter words are left alone).
 * An already-masked phone (07XXXXX678) is not a code, so a second pass leaves it as it is.
 */
const MPESA_CODE =
  /\b(?!\d{2}X{3,}\d{3}\b)(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10}\b/g;

/** A currency marker right before a number marks it as an amount. */
const AMOUNT_PREFIX = /(?:ksh?s?|kes|sh)\.?\s?$/i;

function maskPhone(prefix: string, rest: string): string {
  const plus = prefix.startsWith('+') ? '+' : '';
  const digits = (prefix + rest).replace(/\D/g, '');
  if (digits.length < 6) return plus + digits;
  return `${plus}${digits.slice(0, 2)}${'X'.repeat(digits.length - 5)}${digits.slice(-3)}`;
}

/** Replaces long digit runs that are not amounts. */
function maskDigitRuns(text: string): string {
  return text.replace(/(?<![\d,.])\d{7,}(?![\d])/g, (run: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 6), offset);
    const after = text.slice(offset + run.length, offset + run.length + 3);
    if (AMOUNT_PREFIX.test(before)) return run;
    if (/^[.,]\d/.test(after)) return run;
    return run.length >= 9 ? '[ACCOUNT]' : '[ID]';
  });
}

export function redact(text: string): string {
  // Codes before phones: a masked phone (07XXXXX678) would otherwise look like a code.
  let out = text.replace(EMAIL, '[EMAIL]');
  out = out.replace(MPESA_CODE, '[CODE]');
  out = out.replace(PHONE, (_m, prefix: string, rest: string) => maskPhone(prefix, rest));
  out = maskDigitRuns(out);
  return out;
}
