import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  categories,
  categoryById,
  childrenOf,
  FEES_ID,
  isHideableCategory,
  isSpendingCategory,
  isSystemCategory,
  matchMerchant,
  merchantById,
  merchants,
  MERCHANTS_VERSION,
  normaliseName,
  PROVIDER_DEFAULTS_VERSION,
  providerDefaultCategory,
  providerDefaultRules,
  resolveCategory,
  SYSTEM_CATEGORIES,
  SYSTEM_CATEGORY_IDS,
  systemCategoryId,
  TAXONOMY_VERSION,
  topLevelCategories,
  topLevelOf,
  TRANSFERS_ID,
  UNCATEGORISED_ID,
} from './index.js';

function readJson(relative: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'),
  ) as unknown;
}

const contract = readJson('../../../contracts/transaction.schema.json') as {
  $defs: {
    TxType: { enum: string[] };
    CounterpartyKind: { enum: string[] };
    Provider: { enum: string[] };
  };
};
const TX_TYPES = contract.$defs.TxType.enum;
const COUNTERPARTY_KINDS = contract.$defs.CounterpartyKind.enum;

const MASTER_PROMPT_GROUPS = [
  'Food & groceries',
  'Eating out & drinks',
  'Transport',
  'Housing & rent',
  'Utilities',
  'Airtime & bundles',
  'Subscriptions & entertainment',
  'Shopping',
  'Health',
  'Education',
  'Family & friends',
  'Chama, savings & investments',
  'Loans & credit',
  'Betting & gaming',
  'Giving',
  'Government & fees',
  'Business',
  'Cash withdrawals',
  'Fees & charges',
  'Income',
  'Transfers',
  'Uncategorised',
];

describe('data files', () => {
  it('carry versions', () => {
    expect(TAXONOMY_VERSION).toBe(1);
    expect(MERCHANTS_VERSION).toBe(1);
    expect(PROVIDER_DEFAULTS_VERSION).toBe(1);
  });

  it('taxonomy.json is flagged for Kiswahili copy review', () => {
    const raw = readJson('../data/taxonomy.json') as { copy_review: boolean; version: number };
    expect(raw.copy_review).toBe(true);
    expect(raw.version).toBe(TAXONOMY_VERSION);
  });

  it('every category has exactly the documented fields', () => {
    const raw = readJson('../data/taxonomy.json') as { categories: Record<string, unknown>[] };
    const expected = [
      'id',
      'parent_id',
      'name_en',
      'name_sw',
      'kind',
      'is_spending',
      'hideable',
      'sort',
      'icon',
    ].sort();
    for (const c of raw.categories)
      expect(Object.keys(c).sort(), String(c['id'])).toEqual(expected);
  });

  it('every merchant has exactly the documented fields', () => {
    const raw = readJson('../data/merchants.json') as { merchants: Record<string, unknown>[] };
    const expected = [
      'id',
      'name',
      'aliases',
      'paybills',
      'tills',
      'category_id',
      'counterparty_kind',
      'verified',
      'source_url',
      'note',
    ].sort();
    for (const m of raw.merchants) expect(Object.keys(m).sort(), String(m['id'])).toEqual(expected);
  });

  it('every provider rule uses only documented fields', () => {
    const raw = readJson('../data/provider-defaults.json') as { rules: Record<string, unknown>[] };
    const allowed = new Set([
      'id',
      'type',
      'direction',
      'counterparty_kind',
      'provider',
      'category_id',
      'confidence',
      'note',
    ]);
    for (const r of raw.rules) {
      for (const key of Object.keys(r))
        expect(allowed.has(key), `${String(r['id'])}.${key}`).toBe(true);
      for (const key of ['id', 'type', 'category_id', 'confidence'])
        expect(key in r, `${String(r['id'])}.${key}`).toBe(true);
    }
  });
});

describe('taxonomy', () => {
  it('has the 22 top-level groups from master prompt §7 in order', () => {
    expect(topLevelCategories().map((c) => c.name_en)).toEqual(MASTER_PROMPT_GROUPS);
  });

  it('has unique ids, two levels, and every parent exists', () => {
    const ids = categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of categories) {
      if (c.parent_id === null) {
        expect(c.id).not.toContain('.');
      } else {
        const parent = categoryById(c.parent_id);
        expect(parent, c.id).toBeDefined();
        expect(parent?.parent_id, c.id).toBeNull();
        expect(c.id.startsWith(`${c.parent_id}.`), c.id).toBe(true);
        expect(c.kind, c.id).toBe(parent?.kind);
        expect(c.is_spending, c.id).toBe(parent?.is_spending);
      }
    }
  });

  it('every top-level group except Uncategorised has sub-categories', () => {
    for (const top of topLevelCategories()) {
      if (top.id === UNCATEGORISED_ID) {
        expect(childrenOf(top.id)).toHaveLength(0);
      } else {
        expect(childrenOf(top.id).length, top.id).toBeGreaterThan(0);
      }
    }
  });

  it('is sorted and has unique sort keys', () => {
    const sorts = categories.map((c) => c.sort);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
    expect(new Set(sorts).size).toBe(sorts.length);
  });

  it('has non-empty English and Kiswahili names and icons', () => {
    for (const c of categories) {
      expect(c.name_en.trim().length, c.id).toBeGreaterThan(0);
      expect(c.name_sw.trim().length, c.id).toBeGreaterThan(0);
      expect(c.icon).toMatch(/^[a-z]+$/);
    }
  });

  it('transfers, cash withdrawals and income are not spending; fees and uncategorised are', () => {
    expect(isSpendingCategory('transfers')).toBe(false);
    expect(isSpendingCategory('transfers.own_accounts')).toBe(false);
    expect(isSpendingCategory('chama_savings')).toBe(false);
    expect(isSpendingCategory('cash_withdrawals')).toBe(false);
    expect(isSpendingCategory('cash_withdrawals.atm')).toBe(false);
    expect(isSpendingCategory('income')).toBe(false);
    expect(isSpendingCategory('income.salary')).toBe(false);
    expect(isSpendingCategory('uncategorised')).toBe(true);
    expect(isSpendingCategory('fees_charges')).toBe(true);
    expect(isSpendingCategory('food_groceries.supermarket')).toBe(true);
    expect(isSpendingCategory('does_not_exist')).toBe(false);
  });

  it('is_spending follows kind', () => {
    for (const c of categories) {
      const expected = c.kind === 'spending' || c.kind === 'fee' || c.kind === 'system';
      expect(c.is_spending, c.id).toBe(expected);
    }
    expect(categoryById('transfers')?.kind).toBe('transfer');
    expect(categoryById('cash_withdrawals')?.kind).toBe('cash');
    expect(categoryById('fees_charges')?.kind).toBe('fee');
    expect(categoryById('income')?.kind).toBe('income');
    expect(categoryById('uncategorised')?.kind).toBe('system');
  });

  it('only betting is hideable', () => {
    for (const c of categories) expect(c.hideable, c.id).toBe(c.id.startsWith('betting_gaming'));
    expect(isHideableCategory('betting_gaming.sports_betting')).toBe(true);
    expect(isHideableCategory('giving')).toBe(false);
  });

  it('exposes the §7 example sub-categories', () => {
    for (const id of [
      'transport.matatu_boda',
      'transport.ride_hailing',
      'transport.fuel',
      'transport.parking',
      'utilities.electricity',
      'utilities.water',
      'utilities.gas',
      'utilities.internet',
      'utilities.tv',
      'income.salary',
      'income.business',
      'income.from_people',
      'income.refunds_reversals',
      'loans_credit.fuliza',
      'loans_credit.mshwari_loan',
      'loans_credit.kcb_mpesa',
      'loans_credit.digital_lender',
      'chama_savings.mshwari',
      'cash_withdrawals.agent',
      'cash_withdrawals.atm',
    ]) {
      expect(categoryById(id), id).toBeDefined();
    }
  });

  it('topLevelOf walks one level up', () => {
    expect(topLevelOf('transport.fuel')?.id).toBe('transport');
    expect(topLevelOf('transport')?.id).toBe('transport');
    expect(topLevelOf('nope')).toBeUndefined();
  });
});

describe('system categories', () => {
  it('keeps the legacy names and maps them to taxonomy ids', () => {
    expect(SYSTEM_CATEGORIES).toEqual(['uncategorised', 'transfer', 'fees']);
    expect(SYSTEM_CATEGORY_IDS).toEqual({
      uncategorised: 'uncategorised',
      transfer: 'transfers',
      fees: 'fees_charges',
    });
    expect(UNCATEGORISED_ID).toBe('uncategorised');
    expect(TRANSFERS_ID).toBe('transfers');
    expect(FEES_ID).toBe('fees_charges');
    for (const id of Object.values(SYSTEM_CATEGORY_IDS))
      expect(categoryById(id)?.parent_id, id).toBeNull();
  });

  it('isSystemCategory accepts legacy names and mapped ids only', () => {
    expect(isSystemCategory('transfer')).toBe(true);
    expect(isSystemCategory('fees')).toBe(true);
    expect(isSystemCategory('uncategorised')).toBe(true);
    expect(isSystemCategory('transfers')).toBe(true);
    expect(isSystemCategory('fees_charges')).toBe(true);
    expect(isSystemCategory('groceries')).toBe(false);
    expect(isSystemCategory('food_groceries')).toBe(false);
    expect(isSystemCategory(42)).toBe(false);
  });

  it('systemCategoryId resolves legacy names and passes ids through', () => {
    expect(systemCategoryId('transfer')).toBe('transfers');
    expect(systemCategoryId('fees')).toBe('fees_charges');
    expect(systemCategoryId('uncategorised')).toBe('uncategorised');
    expect(systemCategoryId('fees_charges')).toBe('fees_charges');
    expect(systemCategoryId('transport')).toBeUndefined();
  });
});

describe('provider defaults', () => {
  it('cover every TxType in the contract and use no unknown types', () => {
    const covered = new Set(providerDefaultRules.map((r) => r.type));
    for (const type of TX_TYPES) expect(covered.has(type), type).toBe(true);
    for (const type of covered) expect(TX_TYPES, type).toContain(type);
  });

  it('point at existing categories and use contract counterparty kinds', () => {
    for (const rule of providerDefaultRules) {
      if (rule.category_id !== null) expect(categoryById(rule.category_id), rule.id).toBeDefined();
      for (const k of rule.counterparty_kind ?? [])
        expect(COUNTERPARTY_KINDS, rule.id).toContain(k);
      for (const p of rule.provider ?? [])
        expect(contract.$defs.Provider.enum, rule.id).toContain(p);
      expect(rule.confidence).toBeGreaterThanOrEqual(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('every type ends with a catch-all rule so lookups without context still resolve deterministically', () => {
    for (const type of TX_TYPES) {
      const last = [...providerDefaultRules].reverse().find((r) => r.type === type);
      expect(last, type).toBeDefined();
      expect(last?.direction, type).toBeUndefined();
      expect(last?.counterparty_kind, type).toBeUndefined();
      expect(last?.provider, type).toBeUndefined();
    }
  });

  it.each([
    ['AIRTIME', {}, 'airtime_bundles.airtime', 0.95],
    ['FULIZA_DRAWDOWN', {}, 'loans_credit.fuliza', 0.95],
    ['FULIZA_REPAY', {}, 'loans_credit.fuliza', 0.95],
    ['MSHWARI_DEPOSIT', {}, 'chama_savings.mshwari', 0.95],
    ['MSHWARI_WITHDRAW', {}, 'chama_savings.mshwari', 0.95],
    ['MSHWARI_LOAN', {}, 'loans_credit.mshwari_loan', 0.95],
    ['KCB_MPESA', {}, 'loans_credit.kcb_mpesa', 0.6],
    ['WITHDRAW', {}, 'cash_withdrawals.agent', 0.95],
    ['ATM', {}, 'cash_withdrawals.atm', 0.95],
    ['DEPOSIT', {}, 'transfers.cash_deposit', 0.9],
    ['BANK_TO_MPESA', {}, 'transfers.bank_mpesa', 0.9],
    ['MPESA_TO_BANK', {}, 'transfers.bank_mpesa', 0.9],
    ['INTERNAL_TRANSFER', {}, 'transfers.own_accounts', 0.9],
    ['RECEIVE_MONEY', { counterparty_kind: 'person' }, 'income.from_people', 0.8],
    ['RECEIVE_MONEY', { counterparty_kind: 'self' }, 'transfers.own_accounts', 0.9],
    ['SEND_MONEY', { counterparty_kind: 'person' }, 'family_friends.sent_to_people', 0.75],
    ['SEND_MONEY', { counterparty_kind: 'self' }, 'transfers.own_accounts', 0.9],
    ['FEE', {}, 'fees_charges.transaction', 0.95],
    ['REVERSAL', { direction: 'in' }, 'income.refunds_reversals', 0.9],
    ['CREDIT', {}, 'income', 0.5],
    ['CREDIT', { counterparty_kind: 'person' }, 'income.from_people', 0.7],
    ['LOAN_REPAY', {}, 'loans_credit', 0.75],
  ] as const)('%s %o → %s', (type, extra, category_id, confidence) => {
    const result = providerDefaultCategory({ type, ...extra });
    expect(result?.category_id).toBe(category_id);
    expect(result?.confidence).toBe(confidence);
  });

  it.each([
    'PAYBILL',
    'BUY_GOODS',
    'POCHI',
    'DEBIT',
    'CARD_PURCHASE',
    'STANDING_ORDER',
    'BALANCE_QUERY',
    'FAILED',
    'OTHER',
  ])('%s has no default', (type) => {
    expect(providerDefaultCategory({ type })).toBeNull();
  });

  it('a reversal that takes money out has no default', () => {
    expect(providerDefaultCategory({ type: 'REVERSAL', direction: 'out' })).toBeNull();
  });

  it('transfer-kind defaults all land in non-spending categories', () => {
    for (const type of [
      'BANK_TO_MPESA',
      'MPESA_TO_BANK',
      'INTERNAL_TRANSFER',
      'MSHWARI_DEPOSIT',
      'WITHDRAW',
      'ATM',
      'DEPOSIT',
    ]) {
      const result = providerDefaultCategory({ type });
      expect(result, type).not.toBeNull();
      expect(isSpendingCategory(result?.category_id ?? ''), type).toBe(false);
    }
  });

  it('returns null for an unknown type', () => {
    expect(providerDefaultCategory({ type: 'NOT_A_TYPE' })).toBeNull();
  });
});

describe('merchants', () => {
  it('has 50–120 seeds with unique ids and existing categories', () => {
    expect(merchants.length).toBeGreaterThanOrEqual(50);
    expect(merchants.length).toBeLessThanOrEqual(120);
    const ids = merchants.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of merchants) {
      expect(categoryById(m.category_id), m.id).toBeDefined();
      expect(COUNTERPARTY_KINDS, m.id).toContain(m.counterparty_kind);
    }
  });

  it('every verified merchant has an https source_url and at least one number', () => {
    const verified = merchants.filter((m) => m.verified);
    expect(verified.length).toBeGreaterThanOrEqual(5);
    for (const m of verified) {
      expect(m.source_url, m.id).toMatch(/^https:\/\//);
      expect(m.paybills.length + m.tills.length, m.id).toBeGreaterThan(0);
    }
    for (const m of merchants.filter((x) => !x.verified)) expect(m.source_url, m.id).toBeNull();
  });

  it('aliases are upper-case, normalised and unique within a merchant; numbers are digits', () => {
    for (const m of merchants) {
      expect(new Set(m.aliases).size, m.id).toBe(m.aliases.length);
      for (const a of m.aliases) expect(normaliseName(a), `${m.id}: ${a}`).toBe(a);
      for (const n of [...m.paybills, ...m.tills]) expect(n, m.id).toMatch(/^\d{3,10}$/);
    }
  });

  it('seeds the merchants the sprint asked for', () => {
    for (const id of [
      'kplc_prepaid',
      'kplc_postpaid',
      'safaricom_airtime',
      'safaricom_home_fibre',
      'multichoice_dstv',
      'multichoice_gotv',
      'zuku',
      'naivas',
      'carrefour',
      'quickmart',
      'uber',
      'bolt',
      'little',
      'netflix',
      'showmax',
      'spotify',
      'sha',
      'nhif',
      'nssf',
      'ntsa',
      'kra',
      'ecitizen',
      'nairobi_water',
      'kcb',
      'equity',
      'coop_bank',
      'ncba',
      'absa',
      'stanbic',
      'mshwari',
      'fuliza',
      'ziidi_mmf',
      'hustler_fund',
      'tala',
      'branch',
      'java_house',
      'artcaffe',
      'kfc',
      'chicken_inn',
      'glovo',
      'jumia',
      'kilimall',
      'totalenergies',
      'shell_vivo',
      'rubis',
      'sportpesa',
      'betika',
      'odibets',
      'faiba',
      'airtel',
      'helb',
      'kenya_airways',
      'madaraka_express',
      'super_metro',
      'church_tithe_generic',
    ]) {
      expect(merchantById(id), id).toBeDefined();
    }
  });

  it('well-known numbers resolve to the right merchant', () => {
    expect(matchMerchant({ paybill: '888880' })?.merchant.id).toBe('kplc_prepaid');
    expect(matchMerchant({ paybill: '888888' })?.merchant.id).toBe('kplc_postpaid');
    expect(matchMerchant({ paybill: '444900' })?.merchant.id).toBe('multichoice_dstv');
    expect(matchMerchant({ paybill: '444400' })?.merchant.id).toBe('nairobi_water');
    expect(matchMerchant({ paybill: '400200' })?.merchant.id).toBe('coop_bank');
    expect(matchMerchant({ paybill: '522522' })?.merchant.id).toBe('kcb');
    expect(matchMerchant({ paybill: '851900' })?.merchant.id).toBe('tala');
  });
});

describe('normaliseName', () => {
  it('upper-cases, strips punctuation and collapses whitespace', () => {
    expect(normaliseName('  Naivas  Ltd. - Kilimani ')).toBe('NAIVAS LTD KILIMANI');
    expect(normaliseName('co-operative bank')).toBe('CO OPERATIVE BANK');
    expect(normaliseName('I&M Bank')).toBe('I&M BANK');
  });
});

describe('matchMerchant', () => {
  it('matches "NAIVAS LTD KILIMANI" to Naivas by alias prefix', () => {
    const match = matchMerchant({ name: 'NAIVAS LTD KILIMANI' });
    expect(match?.merchant.id).toBe('naivas');
    expect(match?.matched_by).toBe('alias');
    expect(match?.confidence).toBe(0.8);
  });

  it('exact alias beats partial alias in confidence', () => {
    expect(matchMerchant({ name: 'NAIVAS' })?.confidence).toBe(0.9);
    expect(matchMerchant({ name: 'naivas supermarket' })?.merchant.id).toBe('naivas');
  });

  it('prefers paybill over name and till over alias', () => {
    const byPaybill = matchMerchant({ name: 'SOME UNKNOWN NAME', paybill: '888880' });
    expect(byPaybill?.merchant.id).toBe('kplc_prepaid');
    expect(byPaybill?.matched_by).toBe('paybill');
    expect(byPaybill?.confidence).toBe(0.95);
    const conflicting = matchMerchant({ name: 'NAIVAS LTD', paybill: '444900' });
    expect(conflicting?.merchant.id).toBe('multichoice_dstv');
  });

  it('tolerates spaces and dashes in numbers', () => {
    expect(matchMerchant({ paybill: '888 880' })?.merchant.id).toBe('kplc_prepaid');
    expect(matchMerchant({ paybill: '888-888' })?.merchant.id).toBe('kplc_postpaid');
  });

  it('disambiguates a shared paybill by name', () => {
    expect(matchMerchant({ paybill: '222222', name: 'KRA' })?.merchant.id).toBe('kra');
    expect(matchMerchant({ paybill: '222222', name: 'NTSA TIMS' })?.merchant.id).toBe('ntsa');
    expect(matchMerchant({ paybill: '222222', name: 'GOVERNMENT OF KENYA' })?.merchant.id).toBe(
      'ecitizen',
    );
    expect(
      matchMerchant({ paybill: '222222' })?.merchant.category_id.startsWith('government_fees'),
    ).toBe(true);
  });

  it('matches whole-word contains, not substrings', () => {
    expect(matchMerchant({ name: 'ST JOHNS ACK CHURCH' })?.merchant.id).toBe(
      'church_tithe_generic',
    );
    expect(matchMerchant({ name: 'BLACKSMITH TRADERS' })).toBeNull();
    expect(matchMerchant({ name: 'SHASHI STORES' })).toBeNull();
  });

  it('prefers the longest alias', () => {
    expect(matchMerchant({ name: 'KCB M-PESA ACCOUNT' })?.merchant.id).toBe('kcb_mpesa');
    expect(matchMerchant({ name: 'KCB BANK KENYA' })?.merchant.id).toBe('kcb');
    expect(matchMerchant({ name: 'SAFARICOM HOME FIBRE' })?.merchant.id).toBe(
      'safaricom_home_fibre',
    );
    expect(matchMerchant({ name: 'SAFARICOM OFFERS' })?.merchant.id).toBe('safaricom_airtime');
  });

  it('matches a till when seeded and returns null for unknown numbers and names', () => {
    expect(matchMerchant({ till: '000000000' })).toBeNull();
    expect(matchMerchant({ name: 'JOHN KAMAU' })).toBeNull();
    expect(matchMerchant({})).toBeNull();
    expect(matchMerchant({ name: '', paybill: '', till: null })).toBeNull();
  });
});

describe('resolveCategory', () => {
  it('merchant table beats provider default', () => {
    const r = resolveCategory({
      type: 'PAYBILL',
      direction: 'out',
      counterparty_kind: 'paybill',
      paybill: '888880',
      name: 'KPLC PREPAID',
    });
    expect(r).toEqual({
      category_id: 'utilities.electricity',
      source: 'merchant',
      confidence: 0.95,
      merchant_id: 'kplc_prepaid',
    });
  });

  it('falls back to the provider default', () => {
    const r = resolveCategory({ type: 'AIRTIME', direction: 'out', counterparty_kind: 'merchant' });
    expect(r.category_id).toBe('airtime_bundles.airtime');
    expect(r.source).toBe('provider_default');
    expect(r.confidence).toBe(0.95);
    expect(r.rule_id).toBe('airtime');
  });

  it('a Buy Goods payment to an unknown till is left for the model', () => {
    expect(
      resolveCategory({
        type: 'BUY_GOODS',
        direction: 'out',
        counterparty_kind: 'till',
        till: '123456',
        name: 'MAMA NJERI SHOP',
      }),
    ).toEqual({
      category_id: null,
      source: 'none',
      confidence: 0,
    });
  });

  it('a Buy Goods payment to a known name uses the merchant table', () => {
    const r = resolveCategory({
      type: 'BUY_GOODS',
      direction: 'out',
      counterparty_kind: 'till',
      till: '123456',
      name: 'NAIVAS LTD KILIMANI',
    });
    expect(r.category_id).toBe('food_groceries.supermarket');
    expect(r.source).toBe('merchant');
  });

  it('sent to a person is family & friends; received from a person is income', () => {
    expect(
      resolveCategory({
        type: 'SEND_MONEY',
        direction: 'out',
        counterparty_kind: 'person',
        name: 'JANE WANJIRU',
      }).category_id,
    ).toBe('family_friends.sent_to_people');
    expect(
      resolveCategory({
        type: 'RECEIVE_MONEY',
        direction: 'in',
        counterparty_kind: 'person',
        name: 'JANE WANJIRU',
      }).category_id,
    ).toBe('income.from_people');
  });

  it('a bank transfer by paybill is a transfer, never spending', () => {
    const r = resolveCategory({
      type: 'PAYBILL',
      direction: 'out',
      counterparty_kind: 'paybill',
      paybill: '400200',
      name: 'CO-OPERATIVE BANK',
    });
    expect(r.category_id).toBe('transfers.bank_mpesa');
    expect(isSpendingCategory(r.category_id ?? '')).toBe(false);
  });

  it('balance queries and failures resolve to none', () => {
    expect(resolveCategory({ type: 'BALANCE_QUERY', direction: 'none' }).source).toBe('none');
    expect(resolveCategory({ type: 'FAILED', direction: 'none' }).source).toBe('none');
  });
});
