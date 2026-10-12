/**
 * A hand-built ledger for tests in this and other packages. Two accounts (M-Pesa and an Equity bank card),
 * July to September 2026. The weekly sample is Monday 21 to Sunday 27 September 2026 (previous week 14 to
 * 20 September); the monthly sample is September 2026 (previous month August). Every figure the tests assert
 * is worked out by hand in `facts.test.ts`.
 *
 * Names in Swahili are working copy [[COPY-REVIEW]].
 */
import type { FactsSheet } from './contracts/facts-sheet.js';
import type { Account, Counterparty, Transaction, TxType } from './contracts/transaction.js';
import { computeFacts } from './facts/compute.js';
import type { CategoryInfo, FactsInput } from './facts/types.js';
import { periodContaining } from './period.js';

export const SAMPLE_MPESA = 'mpesa:07XXXXX123';
export const SAMPLE_BANK = 'bank:equity:***456';

/** Deterministic, valid UUID for fixture row `n`. */
export function sampleId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

interface Row {
  readonly n: number;
  readonly at: string; // local Nairobi time, "2026-09-21 07:45" or with seconds
  readonly type: TxType;
  readonly dir: Transaction['direction'];
  readonly ksh: number;
  readonly feeKsh?: number;
  readonly balKsh?: number | null;
  readonly cp?: Counterparty;
  readonly cat?: string | null;
  readonly acct?: 'mpesa' | 'bank';
  readonly transfer?: boolean;
  readonly pair?: number;
}

const cents = (ksh: number): number => Math.round(ksh * 100);

function toTx(r: Row): Transaction {
  const [date, time = '00:00'] = r.at.split(' ');
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  const occurred = `${date}T${hhmmss}+03:00`;
  const bank = r.acct === 'bank';
  return {
    id: sampleId(r.n),
    account_ref: bank ? SAMPLE_BANK : SAMPLE_MPESA,
    provider: bank ? 'bank' : 'mpesa',
    external_ref: bank ? null : `SIL${String(r.n).padStart(7, '0')}`,
    type: r.type,
    direction: r.dir,
    amount_cents: cents(r.ksh),
    fee_cents: cents(r.feeKsh ?? 0),
    balance_after_cents: r.balKsh == null ? null : cents(r.balKsh),
    occurred_at: occurred,
    received_at: occurred,
    counterparty: r.cp ?? { kind: 'unknown', name: null },
    category_id: r.cat ?? null,
    category_source: r.cat ? 'rule' : 'none',
    is_transfer: r.transfer ?? false,
    transfer_pair_id: r.pair === undefined ? null : sampleId(r.pair),
    parse_confidence: 1,
    source: 'sms',
    raw_hash: r.n.toString(16).padStart(64, '0'),
    parser: { pack_id: bank ? 'equity' : 'mpesa', pack_version: '1.0.0', family_id: r.type.toLowerCase() },
    user_edited: false,
    updated_at: occurred,
  };
}

/**
 * A valid transaction for tests: an M-Pesa BUY_GOODS of KSh 100 at 2026-09-21 12:00 Nairobi unless overridden.
 * `n` makes the id (and raw_hash) unique.
 */
export function makeTransaction(n: number, overrides: Partial<Transaction> = {}): Transaction {
  const occurred = overrides.occurred_at ?? '2026-09-21T12:00:00+03:00';
  return {
    id: sampleId(n),
    account_ref: SAMPLE_MPESA,
    provider: 'mpesa',
    external_ref: null,
    type: 'BUY_GOODS',
    direction: 'out',
    amount_cents: 10_000,
    fee_cents: 0,
    balance_after_cents: null,
    occurred_at: occurred,
    received_at: occurred,
    counterparty: { kind: 'unknown', name: null },
    category_id: null,
    category_source: 'none',
    is_transfer: false,
    transfer_pair_id: null,
    parse_confidence: 1,
    source: 'sms',
    raw_hash: n.toString(16).padStart(64, '0'),
    parser: { pack_id: 'test', pack_version: '1.0.0', family_id: 'test' },
    user_edited: false,
    updated_at: occurred,
    ...overrides,
  };
}

const till = (name: string): Counterparty => ({ kind: 'till', name });
const paybill = (name: string, number: string): Counterparty => ({ kind: 'paybill', name, paybill: number });
const merchant = (name: string): Counterparty => ({ kind: 'merchant', name });
const person = (name: string, ref: string): Counterparty => ({ kind: 'person', name, ref_masked: ref });
const agent: Counterparty = { kind: 'agent', name: 'Kilimani Shop Agent' };
const JANE = person('JANE WANJIKU', '07XXXXX456');
const PETER = person('PETER OTIENO', '07XXXXX789');
const SAF_HOME = paybill('Safaricom Home', '150501');
const KPLC = paybill('KPLC PREPAID', '888880');
const SALARY: Counterparty = { kind: 'unknown', name: 'ACME LTD SALARY' };

const ROWS: readonly Row[] = [
  // July and August: history for recurring payments and "new merchant".
  { n: 1, at: '2026-07-01 09:10', type: 'PAYBILL', dir: 'out', ksh: 2999, cp: SAF_HOME, cat: 'utilities' },
  { n: 2, at: '2026-07-05 20:00', type: 'CARD_PURCHASE', dir: 'out', ksh: 1100, cp: merchant('Netflix'), cat: 'subscriptions', acct: 'bank' },
  { n: 3, at: '2026-08-01 09:10', type: 'PAYBILL', dir: 'out', ksh: 2999, cp: SAF_HOME, cat: 'utilities' },
  { n: 4, at: '2026-08-05 20:00', type: 'CARD_PURCHASE', dir: 'out', ksh: 1100, cp: merchant('Netflix'), cat: 'subscriptions', acct: 'bank' },
  { n: 5, at: '2026-08-15 18:00', type: 'BUY_GOODS', dir: 'out', ksh: 2400, cp: till('Naivas Kilimani'), cat: 'food_groceries' },
  { n: 6, at: '2026-08-17 19:00', type: 'PAYBILL', dir: 'out', ksh: 1500, cp: KPLC, cat: 'utilities' },
  { n: 7, at: '2026-08-25 10:00', type: 'CREDIT', dir: 'in', ksh: 85000, cp: SALARY, cat: 'income', acct: 'bank' },
  // 1 to 13 September.
  { n: 8, at: '2026-09-01 09:10', type: 'PAYBILL', dir: 'out', ksh: 2999, cp: SAF_HOME, cat: 'utilities' },
  { n: 9, at: '2026-09-05 20:00', type: 'CARD_PURCHASE', dir: 'out', ksh: 1100, cp: merchant('Netflix'), cat: 'subscriptions', acct: 'bank' },
  { n: 10, at: '2026-09-07 12:30', type: 'BUY_GOODS', dir: 'out', ksh: 450, cp: till('Java House'), cat: 'eating_out' },
  // Previous week: Monday 14 to Sunday 20 September.
  { n: 11, at: '2026-09-14 08:00', type: 'BUY_GOODS', dir: 'out', ksh: 2600, cp: till('Naivas Kilimani'), cat: 'food_groceries' },
  { n: 12, at: '2026-09-15 13:00', type: 'BUY_GOODS', dir: 'out', ksh: 500, cp: till('Java House'), cat: 'eating_out' },
  { n: 13, at: '2026-09-16 18:00', type: 'SEND_MONEY', dir: 'out', ksh: 2000, feeKsh: 29, cp: JANE, cat: 'family_friends' },
  { n: 14, at: '2026-09-16 19:00', type: 'BUY_GOODS', dir: 'out', ksh: 480, cp: till('JAVA  HOUSE '), cat: 'eating_out' },
  { n: 15, at: '2026-09-17 12:00', type: 'AIRTIME', dir: 'out', ksh: 200, cat: 'airtime' },
  { n: 16, at: '2026-09-18 08:15', type: 'CARD_PURCHASE', dir: 'out', ksh: 1200, cp: merchant('Uber'), cat: 'transport', acct: 'bank' },
  { n: 17, at: '2026-09-19 15:00', type: 'WITHDRAW', dir: 'out', ksh: 2000, feeKsh: 52, cp: agent, cat: 'cash' },
  // Report week: Monday 21 to Sunday 27 September.
  { n: 20, at: '2026-09-21 07:45', type: 'BUY_GOODS', dir: 'out', ksh: 1850, balKsh: 3729, cp: till('Naivas Kilimani'), cat: 'food_groceries' },
  { n: 21, at: '2026-09-21 13:10', type: 'SEND_MONEY', dir: 'out', ksh: 2000, feeKsh: 29, balKsh: 1700, cp: JANE, cat: 'family_friends' },
  { n: 22, at: '2026-09-22 08:30', type: 'AIRTIME', dir: 'out', ksh: 100, balKsh: 1600, cat: 'airtime' },
  { n: 23, at: '2026-09-22 18:40:00', type: 'FULIZA_DRAWDOWN', dir: 'in', ksh: 500, feeKsh: 5, cat: 'loans' },
  { n: 24, at: '2026-09-22 18:40:05', type: 'BUY_GOODS', dir: 'out', ksh: 2100, balKsh: 0, cp: till('Java House'), cat: 'eating_out' },
  { n: 25, at: '2026-09-23 12:30', type: 'CARD_PURCHASE', dir: 'out', ksh: 4300, balKsh: 20700, cp: merchant('Carrefour Junction'), cat: 'shopping', acct: 'bank' },
  { n: 26, at: '2026-09-24 09:00:00', type: 'RECEIVE_MONEY', dir: 'in', ksh: 700, balKsh: 700, cp: JANE, cat: 'income' },
  { n: 27, at: '2026-09-24 09:00:01', type: 'FULIZA_REPAY', dir: 'out', ksh: 505, balKsh: 195, cat: 'loans' },
  { n: 28, at: '2026-09-25 10:00', type: 'CREDIT', dir: 'in', ksh: 85000, balKsh: 105700, cp: SALARY, cat: 'income', acct: 'bank' },
  { n: 29, at: '2026-09-25 10:30:00', type: 'BANK_TO_MPESA', dir: 'out', ksh: 10000, balKsh: 95700, cp: { kind: 'self', name: null }, cat: 'transfer', acct: 'bank', transfer: true, pair: 30 },
  { n: 30, at: '2026-09-25 10:30:20', type: 'BANK_TO_MPESA', dir: 'in', ksh: 10000, balKsh: 10195, cp: { kind: 'self', name: null }, cat: 'transfer', transfer: true, pair: 29 },
  { n: 31, at: '2026-09-25 19:30', type: 'PAYBILL', dir: 'out', ksh: 1000, balKsh: 9195, cp: KPLC, cat: 'utilities' },
  { n: 32, at: '2026-09-25 19:45', type: 'PAYBILL', dir: 'out', ksh: 1000, balKsh: 8195, cp: KPLC, cat: 'utilities' },
  { n: 33, at: '2026-09-25 21:30', type: 'BUY_GOODS', dir: 'out', ksh: 650, balKsh: 7545, cp: till('Kenchic Inn'), cat: 'eating_out' },
  { n: 34, at: '2026-09-26 08:00', type: 'FEE', dir: 'out', ksh: 150, balKsh: 95550, cp: { kind: 'bank', name: 'Equity Bank' }, cat: 'fees', acct: 'bank' },
  { n: 35, at: '2026-09-26 11:00', type: 'MSHWARI_DEPOSIT', dir: 'out', ksh: 2000, balKsh: 5545, cat: 'savings' },
  { n: 36, at: '2026-09-26 12:00', type: 'WITHDRAW', dir: 'out', ksh: 3000, feeKsh: 69, balKsh: 2476, cp: agent, cat: 'cash' },
  { n: 37, at: '2026-09-27 09:00', type: 'BALANCE_QUERY', dir: 'none', ksh: 0, balKsh: 2476 },
  { n: 38, at: '2026-09-27 10:00', type: 'REVERSAL', dir: 'in', ksh: 1000, balKsh: 3476, cp: KPLC, cat: 'income' },
  { n: 39, at: '2026-09-27 23:10', type: 'SEND_MONEY', dir: 'out', ksh: 800, feeKsh: 13, balKsh: 2663, cp: PETER, cat: 'family_friends' },
];

/** The sample ledger: 37 rows, one of them a BALANCE_QUERY the engine ignores. */
export function sampleTransactions(): Transaction[] {
  return ROWS.map(toTx);
}

export function sampleAccounts(): Account[] {
  return [
    {
      account_ref: SAMPLE_MPESA, provider: 'mpesa', institution: 'Safaricom', label: 'M-Pesa', mask: '07XXXXX123',
      last_balance_cents: null, last_balance_at: null,
    },
    {
      account_ref: SAMPLE_BANK, provider: 'bank', institution: 'Equity Bank', label: 'Equity Bank', mask: '***456',
      last_balance_cents: 2_500_000, last_balance_at: '2026-09-20T18:00:00+03:00',
    },
  ];
}

export function sampleCategories(): CategoryInfo[] {
  return [
    { id: 'food_groceries', name_en: 'Food & groceries', name_sw: 'Chakula na mahitaji', kind: 'spend' },
    { id: 'eating_out', name_en: 'Eating out & drinks', name_sw: 'Kula nje na vinywaji', kind: 'spend' },
    { id: 'transport', name_en: 'Transport', name_sw: 'Usafiri', kind: 'spend' },
    { id: 'utilities', name_en: 'Utilities', name_sw: 'Huduma za nyumbani', kind: 'spend' },
    { id: 'airtime', name_en: 'Airtime & bundles', name_sw: 'Muda wa maongezi na bando', kind: 'spend' },
    { id: 'subscriptions', name_en: 'Subscriptions & entertainment', name_sw: 'Usajili na burudani', kind: 'spend' },
    { id: 'shopping', name_en: 'Shopping', name_sw: 'Manunuzi', kind: 'spend' },
    { id: 'family_friends', name_en: 'Family & friends', name_sw: 'Familia na marafiki', kind: 'spend' },
    { id: 'cash', name_en: 'Cash withdrawals', name_sw: 'Pesa taslimu', kind: 'cash' },
    { id: 'savings', name_en: 'Chama, savings & investments', name_sw: 'Chama, akiba na uwekezaji', kind: 'savings' },
    { id: 'loans', name_en: 'Loans & credit', name_sw: 'Mikopo', kind: 'loan' },
    { id: 'fees', name_en: 'Fees & charges', name_sw: 'Ada na makato', kind: 'fee' },
    { id: 'transfer', name_en: 'Transfers', name_sw: 'Uhamisho', kind: 'transfer' },
    { id: 'income', name_en: 'Income', name_sw: 'Mapato', kind: 'income' },
    { id: 'uncategorised', name_en: 'Uncategorised', name_sw: 'Bila kundi', kind: 'other' },
  ];
}

/** Weekly: 21 to 27 September 2026, generated Monday 28 September. Monthly: September 2026, generated 1 October. */
export function sampleFactsInput(kind: 'weekly' | 'monthly' = 'weekly'): FactsInput {
  const weekly = kind === 'weekly';
  const generated_at = weekly ? '2026-09-28T07:00:00+03:00' : '2026-10-01T07:00:00+03:00';
  const period = weekly
    ? periodContaining('week', { year: 2026, month: 9, day: 21 }, { now: generated_at })
    : periodContaining('month', { year: 2026, month: 9, day: 1 }, { now: generated_at });
  return {
    user: { locale: 'en', week_start: 'monday', display_name: 'Wanjiru' },
    kind,
    period,
    transactions: sampleTransactions(),
    accounts: sampleAccounts(),
    categories: sampleCategories(),
    budgets: [
      { category_id: 'eating_out', limit_cents: 250_000, period: 'weekly' },
      { category_id: 'family_friends', limit_cents: 300_000, period: 'weekly' },
      { category_id: 'food_groceries', limit_cents: 300_000, period: 'weekly' },
      { category_id: 'shopping', limit_cents: 500_000, period: 'monthly' },
      { category_id: 'eating_out', limit_cents: 600_000, period: 'monthly' },
    ],
    unknown_message_count: 2,
    late_arrival_count: 1,
    generated_at,
    previous_report_totals: weekly
      ? { out_cents: 1_500_000, in_cents: 9_000_000, fees_cents: 30_000 }
      : { out_cents: 2_500_000, in_cents: 9_000_000, fees_cents: 60_000 },
  };
}

export function sampleFactsSheet(kind: 'weekly' | 'monthly' = 'weekly'): FactsSheet {
  return computeFacts(sampleFactsInput(kind));
}
