/**
 * Deterministic text measurement for layout (no DOM). Average advance widths for Schibsted Grotesk at 1 em: digits
 * are tabular (`tnum`), so every figure is the same width. Generous rather than exact, so labels never collide.
 */
const DIGIT = 0.6;
const UPPER = 0.72;
const LOWER = 0.58;
const NARROW = 0.3;
const SPACE = 0.26;

export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (/\d/.test(ch)) em += DIGIT;
    else if (ch === ' ') em += SPACE;
    else if (/[,.:;'’|!il]/.test(ch)) em += NARROW;
    else if (/[A-Z]/.test(ch)) em += UPPER;
    else if (/[%+\-()]/.test(ch)) em += 0.5;
    else em += LOWER;
  }
  return em * fontSize;
}

/** Shortens a label with an ellipsis until it fits; keeps at least three characters. */
export function fit(text: string, maxWidth: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && textWidth(`${t}…`, fontSize) > maxWidth) t = t.slice(0, -1).trimEnd();
  return `${t}…`;
}

const KEEP_CAPS = /^[^AEIOU]{2,5}$/; // acronyms without vowels: KCB, KPLC, DTB, NCBA
const SUFFIXES: Readonly<Record<string, string>> = { LTD: 'Ltd', PLC: 'Plc', INC: 'Inc', CO: 'Co' };

/**
 * Names arrive from SMS parsers in capitals ("QUICKMART LTD"). Charts never shout: a name that is entirely upper
 * case is rendered in title case, keeping vowel-less acronyms (KPLC, KCB) and company suffixes (Ltd).
 */
export function humanName(name: string): string {
  if (!/[A-Z]/.test(name) || name !== name.toUpperCase()) return name;
  return name
    .split(/(\s+)/)
    .map((w) => {
      if (!/[A-Z]/.test(w)) return w;
      const core = w.replace(/[^A-Z0-9]/g, '');
      if (SUFFIXES[core]) return w.replace(core, SUFFIXES[core]!);
      if (KEEP_CAPS.test(core)) return w;
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join('');
}
