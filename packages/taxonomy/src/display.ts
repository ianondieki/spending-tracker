/**
 * Display names for reports. Money SMS carry merchant names as raw upper-case text ("NAIVAS LTD KILIMANI",
 * "QUICKMART LTD"); a report should say "Naivas Kilimani" and "Quickmart". Seeds win when they match; otherwise
 * the text is title-cased with legal suffixes removed and known acronyms kept upper-case. Nothing here invents a
 * name: an already mixed-case name is returned untouched apart from whitespace.
 */
import {
  matchMerchant,
  normaliseName,
  type CounterpartyKind,
  type MerchantLookup,
} from './index.js';

/** Trailing tokens that name a legal form, not the business. Stripped only when they are whole trailing tokens. */
const LEGAL_SUFFIXES = new Set([
  'LTD',
  'LIMITED',
  'PLC',
  'CO',
  'INC',
  'LLC',
  'LLP',
  'LTD.',
  'CO.',
  'INC.',
]);
/** Trailing tokens that mark a branch without naming it. A named branch ("KILIMANI") is kept. */
const BRANCH_SUFFIXES = new Set(['BRANCH', 'BR', 'OUTLET']);

/** Acronyms and brand spellings that stay as written here whatever case the SMS used. */
const KEEP_CASE: ReadonlyMap<string, string> = new Map(
  [
    'KPLC',
    'DSTV',
    'GOTV',
    'NHIF',
    'SHA',
    'SHIF',
    'NSSF',
    'KRA',
    'NTSA',
    'KCB',
    'NCBA',
    'DTB',
    'I&M',
    'ATM',
    'SGR',
    'HELB',
    'KQ',
    'KWS',
    'KBC',
    'KTDA',
    'KPA',
    'KRC',
    'NHC',
    'NBK',
    'HFC',
    'CBK',
    'USSD',
    'VAT',
    'PAYE',
    'TV',
    'ICT',
    'IT',
    'M-PESA',
    'M-SHWARI',
    'KCB M-PESA',
    'MMF',
    'SACCO',
    'JTL',
    'IPSL',
    'ID',
  ].map((token) => [token.toUpperCase(), token]),
);
/** Spellings Safaricom uses, keyed by the upper-cased token as an SMS writes it. */
const BRAND_SPELLINGS: ReadonlyMap<string, string> = new Map([
  ['M-PESA', 'M-PESA'],
  ['MPESA', 'M-PESA'],
  ['M-SHWARI', 'M-Shwari'],
  ['MSHWARI', 'M-Shwari'],
  ['FULIZA', 'Fuliza'],
  ['ZIIDI', 'Ziidi'],
  ['ECITIZEN', 'eCitizen'],
  ['E-CITIZEN', 'eCitizen'],
  ['ITAX', 'iTax'],
]);
/** Small words kept lower-case inside a name (English and Kiswahili). */
const SMALL_WORDS = new Set([
  'of',
  'and',
  'the',
  'na',
  'ya',
  'wa',
  'la',
  'za',
  'at',
  'by',
  'for',
  'to',
  'de',
]);

export interface MerchantNameOptions extends Pick<MerchantLookup, 'paybill' | 'till'> {
  /** Reserved: future per-user overrides. */
  readonly locale?: 'en' | 'sw';
}

/**
 * The name a report shows for a counterparty.
 * (a) A merchant seed match (paybill, till or alias; case-insensitive, whitespace collapsed) gives the seed's display
 *     name; a named branch after the alias is kept ("NAIVAS LTD KILIMANI" → "Naivas Kilimani").
 * (b) Otherwise the text is title-cased, trailing legal and branch suffix tokens are removed, acronyms on the
 *     allow-list stay upper-case and Safaricom brand spellings are applied ("MAKAO PROPERTIES LTD" → "Makao Properties").
 * (c) A name that is already mixed case is returned with only its whitespace collapsed.
 */
export function normaliseMerchantName(raw: string, options: MerchantNameOptions = {}): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return '';

  const match = matchMerchant({
    name: collapsed,
    paybill: options.paybill ?? null,
    till: options.till ?? null,
  });
  if (match) {
    const display = match.merchant.display_name ?? match.merchant.name;
    const remainder = branchRemainder(collapsed, match.merchant.aliases);
    // A number match is authoritative. An alias match counts only when the alias starts the name: a bare
    // "contains" hit ("BOARD OF KRA AND NTSA", "… LTD BRANCH") must not rename an unrelated business.
    if (match.matched_by !== 'alias')
      return remainder ? `${display} ${titleCase(remainder)}` : display;
    if (remainder !== null) return remainder ? `${display} ${titleCase(remainder)}` : display;
  }

  if (isMixedCase(collapsed)) return collapsed;
  return titleCase(stripSuffixes(collapsed));
}

/**
 * Tokens of the raw name that follow the longest alias that starts it, minus legal suffixes: the named branch, if
 * any ('' when nothing follows). null when no alias starts the name.
 */
function branchRemainder(raw: string, aliases: readonly string[]): string | null {
  const normalised = normaliseName(raw);
  const tokens = normalised.split(' ');
  let best: string[] | null = null;
  for (const alias of aliases) {
    const aliasTokens = alias.split(' ');
    if (aliasTokens.length > tokens.length) continue;
    if (aliasTokens.every((t, i) => tokens[i] === t)) {
      const rest = tokens.slice(aliasTokens.length);
      if (best === null || rest.length < best.length) best = rest;
    }
  }
  if (!best) return null;
  return best.length === 0 ? '' : stripSuffixes(best.join(' '));
}

function stripSuffixes(text: string): string {
  const tokens = text.split(' ').filter((t) => t.length > 0);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]!.toUpperCase();
    if (LEGAL_SUFFIXES.has(last) || BRANCH_SUFFIXES.has(last)) tokens.pop();
    else break;
  }
  return tokens.join(' ');
}

function isMixedCase(text: string): boolean {
  return /[a-z]/.test(text) && /[A-Z]/.test(text);
}

/** Title-cases upper- or lower-case text token by token; hyphenated and slashed parts are cased separately. */
export function titleCase(text: string): string {
  const tokens = text.split(' ').filter((t) => t.length > 0);
  return tokens
    .map((token, index) => {
      const upper = token.toUpperCase();
      const brand = BRAND_SPELLINGS.get(upper);
      if (brand) return brand;
      const kept = KEEP_CASE.get(upper);
      if (kept) return kept;
      if (/\d/.test(token)) return upper;
      const lower = token.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower
        .split(/([-/'])/)
        .map((part) =>
          part.length === 1 && /[-/']/.test(part)
            ? part
            : part.charAt(0).toUpperCase() + part.slice(1),
        )
        .join('');
    })
    .join(' ');
}

/** Transaction types whose counterparty is a cash point, never a merchant. */
export const AGENT_TRANSACTION_TYPES: ReadonlySet<string> = new Set(['WITHDRAW', 'DEPOSIT', 'ATM']);
/** Counterparty kinds that belong in a merchant list. People, agents, banks and the user's own accounts do not. */
export const MERCHANT_COUNTERPARTY_KINDS: ReadonlySet<CounterpartyKind> = new Set([
  'merchant',
  'paybill',
  'till',
  'unknown',
]);

/**
 * Whether a transaction's counterparty belongs in a "where the money went" merchant list. M-Pesa agents
 * (`counterparty_kind: agent`, types WITHDRAW/DEPOSIT) are cash points and stay out; so do people, banks and self.
 */
export function isMerchantCounterparty(input: {
  counterparty_kind: CounterpartyKind | string;
  type?: string | null;
}): boolean {
  if (input.type && AGENT_TRANSACTION_TYPES.has(input.type)) return false;
  return MERCHANT_COUNTERPARTY_KINDS.has(input.counterparty_kind as CounterpartyKind);
}
