/**
 * Inline demo ledger used by `seed:demo` until Lane D's `corpus/demo/demo-inbox.jsonl` and the pack
 * engine land. Two months of plausible Kenyan money movement for one person: salary in, rent, groceries,
 * matatu fares, airtime, a Fuliza drawdown with its repayment and fee, an M-Shwari deposit, a bank
 * transfer pair, a recurring Safaricom Home bill, a duplicate payment, a reversal. Every name is made up.
 * Amounts are integer KES cents. Deterministic: same `now` → same ids and timestamps.
 */
import { createHash } from 'node:crypto';

import type { Account, Transaction } from '@hesabu/analytics';

const DAY = 86_400_000;

function uuidFrom(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function at(base: Date, daysAgo: number, hour: number, minute = 0): string {
  const d = new Date(base.getTime() - daysAgo * DAY);
  const local = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 3, minute));
  return local.toISOString().replace('.000Z', '+00:00').replace('+00:00', 'Z');
}

interface Spec {
  key: string;
  daysAgo: number;
  hour: number;
  minute?: number;
  type: Transaction['type'];
  direction: Transaction['direction'];
  amount: number;
  fee?: number;
  cp: Transaction['counterparty'];
  category?: string | null;
  account?: string;
  provider?: Transaction['provider'];
  transfer?: boolean;
  pair?: string;
  family?: string;
}

function build(base: Date, s: Spec, balance: { v: number }): Transaction {
  const occurred = at(base, s.daysAgo, s.hour, s.minute ?? 0);
  const amount = Math.round(s.amount * 100);
  const fee = Math.round((s.fee ?? 0) * 100);
  if (s.direction === 'out') balance.v -= amount + fee;
  else if (s.direction === 'in') balance.v += amount;
  const id = uuidFrom(`demo:${s.key}`);
  const family = s.family ?? s.type.toLowerCase();
  return {
    id,
    account_ref: s.account ?? 'mpesa:07XXXXX321',
    provider: s.provider ?? 'mpesa',
    external_ref: (s.provider ?? 'mpesa') === 'mpesa' ? `R${createHash('md5').update(s.key).digest('hex').slice(0, 9).toUpperCase()}` : null,
    type: s.type,
    direction: s.direction,
    amount_cents: amount,
    fee_cents: fee,
    balance_after_cents: (s.account ?? 'mpesa:07XXXXX321') === 'mpesa:07XXXXX321' ? balance.v : null,
    occurred_at: occurred,
    received_at: occurred,
    counterparty: s.cp,
    category_id: s.category === undefined ? null : s.category,
    category_source: s.category ? 'merchant' : 'none',
    category_confidence: s.category ? 0.9 : 0,
    is_transfer: s.transfer ?? false,
    transfer_pair_id: s.pair ? uuidFrom(`demo:${s.pair}`) : null,
    parse_confidence: 0.98,
    source: 'sms',
    raw_hash: createHash('sha256').update(`demo-sms:${s.key}`).digest('hex'),
    parser: { pack_id: s.provider ?? 'mpesa', pack_version: '1.0.0', family_id: family },
    user_edited: false,
    note: null,
    tags: [],
    updated_at: occurred,
  };
}

const person = (name: string, ref: string): Transaction['counterparty'] => ({ kind: 'person', name, ref_masked: ref });
const till = (name: string, no: string): Transaction['counterparty'] => ({ kind: 'till', name, till: no });
const paybill = (name: string, no: string, acct: string): Transaction['counterparty'] => ({ kind: 'paybill', name, paybill: no, account_ref: acct });
const agent = (name: string): Transaction['counterparty'] => ({ kind: 'agent', name });
const self: Transaction['counterparty'] = { kind: 'self', name: null };
const bank = (name: string): Transaction['counterparty'] => ({ kind: 'bank', name });

/** Weekly pattern repeated over `weeks` weeks back from `base`; `week` 0 is the week containing `base`. */
function weeklySpecs(week: number): Spec[] {
  const d = week * 7;
  const specs: Spec[] = [
    { key: `w${week}-groceries`, daysAgo: d + 6, hour: 18, minute: 12, type: 'BUY_GOODS', direction: 'out', amount: 3450 + (week % 3) * 400, cp: till('NAIVAS SUPERMARKET', '834501'), category: 'groceries' },
    { key: `w${week}-mamamboga`, daysAgo: d + 3, hour: 19, minute: 5, type: 'BUY_GOODS', direction: 'out', amount: 620, cp: till('MAMA MBOGA KINOO', '552310'), category: 'groceries' },
    { key: `w${week}-matatu1`, daysAgo: d + 5, hour: 7, minute: 40, type: 'SEND_MONEY', direction: 'out', amount: 100, fee: 0, cp: person('MATATU SACCO', '07XXXXX010'), category: 'transport' },
    { key: `w${week}-matatu2`, daysAgo: d + 2, hour: 7, minute: 45, type: 'SEND_MONEY', direction: 'out', amount: 100, fee: 0, cp: person('MATATU SACCO', '07XXXXX010'), category: 'transport' },
    { key: `w${week}-airtime`, daysAgo: d + 4, hour: 21, minute: 30, type: 'AIRTIME', direction: 'out', amount: 100, cp: { kind: 'merchant', name: 'SAFARICOM AIRTIME' }, category: 'airtime' },
    { key: `w${week}-lunch`, daysAgo: d + 1, hour: 13, minute: 10, type: 'BUY_GOODS', direction: 'out', amount: 350 + (week % 2) * 80, cp: till('JAVA HOUSE', '112233'), category: 'eating_out' },
    { key: `w${week}-bundles`, daysAgo: d + 0, hour: 22, minute: 15, type: 'PAYBILL', direction: 'out', amount: 250, cp: paybill('SAFARICOM DATA', '888880', 'bundles'), category: 'airtime' },
  ];
  if (week % 2 === 0) {
    specs.push({ key: `w${week}-mum`, daysAgo: d + 4, hour: 17, minute: 0, type: 'SEND_MONEY', direction: 'out', amount: 2000, fee: 33, cp: person('MARY W', '07XXXXX456'), category: 'family' });
  }
  if (week % 3 === 1) {
    specs.push({ key: `w${week}-friend-in`, daysAgo: d + 2, hour: 20, minute: 40, type: 'RECEIVE_MONEY', direction: 'in', amount: 1500, cp: person('JOHN K', '07XXXXX789') });
  }
  return specs;
}

export function demoSpecs(base: Date): Spec[] {
  const specs: Spec[] = [];
  for (let week = 0; week < 10; week += 1) specs.push(...weeklySpecs(week));
  // Monthly events, anchored on days-ago offsets so two full months are covered.
  for (const [m, daysAgo] of [[0, 8], [1, 38], [2, 68]] as const) {
    specs.push(
      { key: `m${m}-salary`, daysAgo, hour: 9, minute: 2, type: 'CREDIT', direction: 'in', amount: 65000, cp: bank('ACME LTD SALARY'), account: 'bank:equity:***456', provider: 'bank', family: 'credit' },
      { key: `m${m}-bank-to-mpesa`, daysAgo: daysAgo - 1, hour: 10, minute: 0, type: 'DEBIT', direction: 'out', amount: 40000, cp: self, account: 'bank:equity:***456', provider: 'bank', transfer: true, pair: `m${m}-mpesa-from-bank`, family: 'debit' },
      { key: `m${m}-mpesa-from-bank`, daysAgo: daysAgo - 1, hour: 10, minute: 1, type: 'BANK_TO_MPESA', direction: 'in', amount: 40000, cp: bank('EQUITY BANK'), transfer: true, pair: `m${m}-bank-to-mpesa` },
      { key: `m${m}-rent`, daysAgo: daysAgo - 2, hour: 8, minute: 30, type: 'PAYBILL', direction: 'out', amount: 18000, fee: 55, cp: paybill('KINOO HEIGHTS LTD', '400200', 'B12'), category: 'rent' },
      { key: `m${m}-home-fibre`, daysAgo: daysAgo - 3, hour: 19, minute: 0, type: 'PAYBILL', direction: 'out', amount: 2999, fee: 23, cp: paybill('SAFARICOM HOME', '150501', '07XXXXX321'), category: 'utilities' },
      { key: `m${m}-kplc`, daysAgo: daysAgo - 4, hour: 20, minute: 10, type: 'PAYBILL', direction: 'out', amount: 1200 + m * 150, fee: 23, cp: paybill('KPLC PREPAID', '888880', '54321'), category: 'utilities' },
      { key: `m${m}-mshwari`, daysAgo: daysAgo - 5, hour: 9, minute: 15, type: 'MSHWARI_DEPOSIT', direction: 'out', amount: 5000, cp: { kind: 'self', name: 'M-SHWARI' }, transfer: false },
      { key: `m${m}-withdraw`, daysAgo: daysAgo - 9, hour: 18, minute: 45, type: 'WITHDRAW', direction: 'out', amount: 3000, fee: 58, cp: agent('AGENT 123456 KINOO'), category: 'cash' },
    );
  }
  // Fuliza: a drawdown that funded a Buy Goods payment near the end of the latest month, repaid on salary day.
  specs.push(
    { key: 'fuliza-payment', daysAgo: 12, hour: 19, minute: 20, type: 'BUY_GOODS', direction: 'out', amount: 2800, cp: till('QUICKMART RUAKA', '990011'), category: 'groceries' },
    { key: 'fuliza-draw', daysAgo: 12, hour: 19, minute: 20, type: 'FULIZA_DRAWDOWN', direction: 'in', amount: 1500, fee: 15, cp: { kind: 'unknown', name: 'FULIZA M-PESA' }, family: 'fuliza_drawdown' },
    { key: 'fuliza-repay', daysAgo: 8, hour: 10, minute: 5, type: 'FULIZA_REPAY', direction: 'out', amount: 1500, fee: 30, cp: { kind: 'unknown', name: 'FULIZA M-PESA' }, family: 'fuliza_repay' },
  );
  // A duplicate payment within the hour and a reversal, both in the most recent full week.
  specs.push(
    { key: 'dup-a', daysAgo: 9, hour: 12, minute: 0, type: 'PAYBILL', direction: 'out', amount: 1000, fee: 23, cp: paybill('DSTV KENYA', '444900', '10233'), category: 'entertainment' },
    { key: 'dup-b', daysAgo: 9, hour: 12, minute: 24, type: 'PAYBILL', direction: 'out', amount: 1000, fee: 23, cp: paybill('DSTV KENYA', '444900', '10233'), category: 'entertainment' },
    { key: 'reversal', daysAgo: 9, hour: 15, minute: 0, type: 'REVERSAL', direction: 'in', amount: 1000, cp: paybill('DSTV KENYA', '444900', '10233'), family: 'reversal' },
    { key: 'new-merchant', daysAgo: 10, hour: 16, minute: 30, type: 'BUY_GOODS', direction: 'out', amount: 4200, cp: till('CARREFOUR TWO RIVERS', '771100'), category: 'shopping' },
  );
  void base;
  return specs;
}

export function demoTransactions(base: Date): Transaction[] {
  const specs = demoSpecs(base).sort((a, b) => b.daysAgo - a.daysAgo || a.hour - b.hour || (a.minute ?? 0) - (b.minute ?? 0));
  const balance = { v: 1_250_000 };
  return specs.map((s) => build(base, s, balance));
}

export function demoAccounts(base: Date): Account[] {
  return [
    { account_ref: 'mpesa:07XXXXX321', provider: 'mpesa', institution: 'Safaricom', label: 'M-Pesa', mask: '07XXXXX321', last_balance_cents: null, last_balance_at: null },
    { account_ref: 'bank:equity:***456', provider: 'bank', institution: 'Equity Bank', label: 'Equity', mask: '***456', last_balance_cents: 8_400_000, last_balance_at: at(base, 1, 9) },
  ];
}

export const DEMO_CATEGORIES = [
  { category_id: 'groceries', parent_id: null, name_en: 'Groceries', name_sw: 'Vyakula', kind: 'spend' },
  { category_id: 'transport', parent_id: null, name_en: 'Transport', name_sw: 'Usafiri', kind: 'spend' },
  { category_id: 'airtime', parent_id: null, name_en: 'Airtime and data', name_sw: 'Airtime na data', kind: 'spend' },
  { category_id: 'eating_out', parent_id: null, name_en: 'Eating out', name_sw: 'Kula nje', kind: 'spend' },
  { category_id: 'family', parent_id: null, name_en: 'Family and friends', name_sw: 'Familia na marafiki', kind: 'spend' },
  { category_id: 'rent', parent_id: null, name_en: 'Rent', name_sw: 'Kodi', kind: 'spend' },
  { category_id: 'utilities', parent_id: null, name_en: 'Utilities', name_sw: 'Huduma za nyumbani', kind: 'spend' },
  { category_id: 'cash', parent_id: null, name_en: 'Cash', name_sw: 'Pesa taslimu', kind: 'cash' },
  { category_id: 'entertainment', parent_id: null, name_en: 'Entertainment', name_sw: 'Burudani', kind: 'spend' },
  { category_id: 'shopping', parent_id: null, name_en: 'Shopping', name_sw: 'Manunuzi', kind: 'spend' },
] as const;
