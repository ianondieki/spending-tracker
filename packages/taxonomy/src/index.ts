/**
 * @hesabu/taxonomy — category taxonomy, merchant seeds and provider-type defaults.
 *
 * The JSON files in `../data/` are the source of truth (Lane A copies them into Android assets; the
 * backend imports this package). They are read with `fs` relative to this module so the same code works
 * from `src/` (tests, typecheck) and `dist/` (runtime), and validated structurally on load: a malformed
 * file throws at import time rather than silently miscategorising (fail closed).
 *
 * Resolution order (master prompt §7): user rule → merchant table → provider default → model → Uncategorised.
 * This package implements the merchant and provider-default steps; rules and the model live elsewhere.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type CategoryKind = 'spending' | 'income' | 'transfer' | 'cash' | 'fee' | 'system';

export interface Category {
  /** Stable snake_case id; sub-categories are `<parent>.<child>`. Never renamed. */
  id: string;
  parent_id: string | null;
  name_en: string;
  /** Kiswahili name; ordinary copy pending human review ([[COPY-REVIEW]]). */
  name_sw: string;
  kind: CategoryKind;
  /** False for transfers, cash withdrawals and income; true for everything else including fees. */
  is_spending: boolean;
  /** The user may hide the category from reports (betting). */
  hideable: boolean;
  sort: number;
  /** Generic icon keyword for the UI; not a brand. */
  icon: string;
}

/** Mirrors `CounterpartyKind` in contracts/transaction.schema.json. */
export type CounterpartyKind =
  'person' | 'merchant' | 'paybill' | 'till' | 'agent' | 'bank' | 'self' | 'unknown';

export type Direction = 'in' | 'out' | 'none';

export interface MerchantSeed {
  id: string;
  /** Canonical display name, e.g. "Naivas". */
  name: string;
  /** Upper-case strings as they appear in money SMS. */
  aliases: string[];
  paybills: string[];
  tills: string[];
  category_id: string;
  counterparty_kind: CounterpartyKind;
  /** True only when `source_url` is an official page that was fetched and shows the number. */
  verified: boolean;
  source_url: string | null;
  note: string | null;
}

export interface ProviderDefaultRule {
  id: string;
  /** A `TxType` from contracts/transaction.schema.json. */
  type: string;
  direction?: Direction;
  counterparty_kind?: CounterpartyKind[];
  provider?: string[];
  /** null: no default; the transaction needs the merchant table, the model or a user rule. */
  category_id: string | null;
  confidence: number;
  note?: string;
}

export type MerchantMatchedBy = 'paybill' | 'till' | 'alias';

export interface MerchantMatch {
  merchant: MerchantSeed;
  matched_by: MerchantMatchedBy;
  confidence: number;
}

export interface MerchantLookup {
  name?: string | null;
  paybill?: string | null;
  till?: string | null;
}

export interface ProviderDefaultLookup {
  type: string;
  direction?: Direction | null;
  counterparty_kind?: CounterpartyKind | string | null;
  provider?: string | null;
}

export interface ProviderDefault {
  category_id: string;
  confidence: number;
  /** The rule that produced the default. */
  rule_id: string;
}

export type CategorySource = 'merchant' | 'provider_default' | 'none';

export type ResolveCategoryInput = ProviderDefaultLookup & MerchantLookup;

export interface ResolvedCategory {
  category_id: string | null;
  source: CategorySource;
  confidence: number;
  merchant_id?: string;
  rule_id?: string;
}

// ---------------------------------------------------------------------------------------------
// Loading and validation (fail closed)
// ---------------------------------------------------------------------------------------------

interface TaxonomyFile {
  version: number;
  copy_review: boolean;
  categories: Category[];
}
interface MerchantsFile {
  version: number;
  merchants: MerchantSeed[];
}
interface ProviderDefaultsFile {
  version: number;
  rules: ProviderDefaultRule[];
}

const CATEGORY_KINDS: readonly CategoryKind[] = [
  'spending',
  'income',
  'transfer',
  'cash',
  'fee',
  'system',
];
const COUNTERPARTY_KINDS: readonly CounterpartyKind[] = [
  'person',
  'merchant',
  'paybill',
  'till',
  'agent',
  'bank',
  'self',
  'unknown',
];
const DIRECTIONS: readonly Direction[] = ['in', 'out', 'none'];
const ID_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)?$/;

class TaxonomyDataError extends Error {
  override name = 'TaxonomyDataError';
}

function fail(file: string, message: string): never {
  throw new TaxonomyDataError(`${file}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function readJson(file: string): unknown {
  const url = new URL(`../data/${file}`, import.meta.url);
  let text: string;
  try {
    text = readFileSync(fileURLToPath(url), 'utf8');
  } catch (error) {
    fail(file, `cannot be read (${(error as Error).message})`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    fail(file, `is not valid JSON (${(error as Error).message})`);
  }
}

function parseTaxonomy(file: string, raw: unknown): TaxonomyFile {
  if (!isRecord(raw)) fail(file, 'must be an object');
  if (typeof raw['version'] !== 'number') fail(file, 'version must be a number');
  if (typeof raw['copy_review'] !== 'boolean') fail(file, 'copy_review must be a boolean');
  if (!Array.isArray(raw['categories']) || raw['categories'].length === 0)
    fail(file, 'categories must be a non-empty array');

  const categories: Category[] = raw['categories'].map((entry: unknown, i: number): Category => {
    const where = `categories[${i}]`;
    if (!isRecord(entry)) fail(file, `${where} must be an object`);
    const id = entry['id'];
    if (typeof id !== 'string' || !ID_PATTERN.test(id))
      fail(file, `${where}.id must match ${ID_PATTERN}`);
    const parent_id = entry['parent_id'];
    if (parent_id !== null && typeof parent_id !== 'string')
      fail(file, `${id}: parent_id must be a string or null`);
    if (parent_id !== null && !id.startsWith(`${parent_id}.`))
      fail(file, `${id}: sub-category id must be prefixed by its parent id`);
    if (parent_id === null && id.includes('.'))
      fail(file, `${id}: top-level id must not contain a dot`);
    for (const key of ['name_en', 'name_sw', 'icon'] as const) {
      const v = entry[key];
      if (typeof v !== 'string' || v.trim() === '')
        fail(file, `${id}: ${key} must be a non-empty string`);
    }
    const kind = entry['kind'];
    if (typeof kind !== 'string' || !(CATEGORY_KINDS as readonly string[]).includes(kind))
      fail(file, `${id}: kind must be one of ${CATEGORY_KINDS.join('|')}`);
    for (const key of ['is_spending', 'hideable'] as const) {
      if (typeof entry[key] !== 'boolean') fail(file, `${id}: ${key} must be a boolean`);
    }
    if (typeof entry['sort'] !== 'number' || !Number.isInteger(entry['sort']))
      fail(file, `${id}: sort must be an integer`);
    return {
      id,
      parent_id,
      name_en: entry['name_en'] as string,
      name_sw: entry['name_sw'] as string,
      kind: kind as CategoryKind,
      is_spending: entry['is_spending'] as boolean,
      hideable: entry['hideable'] as boolean,
      sort: entry['sort'] as number,
      icon: entry['icon'] as string,
    };
  });

  const ids = new Set<string>();
  for (const c of categories) {
    if (ids.has(c.id)) fail(file, `duplicate category id ${c.id}`);
    ids.add(c.id);
  }
  for (const c of categories) {
    if (c.parent_id !== null) {
      if (!ids.has(c.parent_id)) fail(file, `${c.id}: parent ${c.parent_id} does not exist`);
      if (c.parent_id.includes('.')) fail(file, `${c.id}: taxonomy has two levels only`);
    }
  }
  return { version: raw['version'], copy_review: raw['copy_review'], categories };
}

function parseMerchants(
  file: string,
  raw: unknown,
  categoryIds: ReadonlySet<string>,
): MerchantsFile {
  if (!isRecord(raw)) fail(file, 'must be an object');
  if (typeof raw['version'] !== 'number') fail(file, 'version must be a number');
  if (!Array.isArray(raw['merchants']) || raw['merchants'].length === 0)
    fail(file, 'merchants must be a non-empty array');

  const ids = new Set<string>();
  const merchants: MerchantSeed[] = raw['merchants'].map(
    (entry: unknown, i: number): MerchantSeed => {
      const where = `merchants[${i}]`;
      if (!isRecord(entry)) fail(file, `${where} must be an object`);
      const id = entry['id'];
      if (typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id))
        fail(file, `${where}.id must be snake_case`);
      if (ids.has(id)) fail(file, `duplicate merchant id ${id}`);
      ids.add(id);
      if (typeof entry['name'] !== 'string' || entry['name'].trim() === '')
        fail(file, `${id}: name must be a non-empty string`);
      for (const key of ['aliases', 'paybills', 'tills'] as const) {
        if (!isStringArray(entry[key])) fail(file, `${id}: ${key} must be an array of strings`);
      }
      const aliases = entry['aliases'] as string[];
      if (aliases.length === 0) fail(file, `${id}: needs at least one alias`);
      for (const a of aliases) {
        if (a !== a.toUpperCase() || normaliseName(a) !== a)
          fail(file, `${id}: alias "${a}" must be upper-case and already normalised`);
      }
      for (const key of ['paybills', 'tills'] as const) {
        for (const n of entry[key] as string[]) {
          if (!/^[0-9]{3,10}$/.test(n))
            fail(file, `${id}: ${key} entry "${n}" must be 3–10 digits`);
        }
      }
      const category_id = entry['category_id'];
      if (typeof category_id !== 'string' || !categoryIds.has(category_id))
        fail(file, `${id}: category_id "${String(category_id)}" is not a taxonomy id`);
      const counterparty_kind = entry['counterparty_kind'];
      if (
        typeof counterparty_kind !== 'string' ||
        !(COUNTERPARTY_KINDS as readonly string[]).includes(counterparty_kind)
      ) {
        fail(file, `${id}: counterparty_kind must be one of ${COUNTERPARTY_KINDS.join('|')}`);
      }
      const verified = entry['verified'];
      if (typeof verified !== 'boolean') fail(file, `${id}: verified must be a boolean`);
      const source_url = entry['source_url'];
      if (
        source_url !== null &&
        (typeof source_url !== 'string' || !/^https:\/\//.test(source_url))
      )
        fail(file, `${id}: source_url must be an https URL or null`);
      if (verified && source_url === null)
        fail(file, `${id}: verified merchants must have a source_url`);
      const note = entry['note'];
      if (note !== null && typeof note !== 'string')
        fail(file, `${id}: note must be a string or null`);
      return {
        id,
        name: entry['name'] as string,
        aliases,
        paybills: entry['paybills'] as string[],
        tills: entry['tills'] as string[],
        category_id,
        counterparty_kind: counterparty_kind as CounterpartyKind,
        verified,
        source_url,
        note,
      };
    },
  );
  return { version: raw['version'], merchants };
}

function parseProviderDefaults(
  file: string,
  raw: unknown,
  categoryIds: ReadonlySet<string>,
): ProviderDefaultsFile {
  if (!isRecord(raw)) fail(file, 'must be an object');
  if (typeof raw['version'] !== 'number') fail(file, 'version must be a number');
  if (!Array.isArray(raw['rules']) || raw['rules'].length === 0)
    fail(file, 'rules must be a non-empty array');

  const ids = new Set<string>();
  const rules: ProviderDefaultRule[] = raw['rules'].map(
    (entry: unknown, i: number): ProviderDefaultRule => {
      const where = `rules[${i}]`;
      if (!isRecord(entry)) fail(file, `${where} must be an object`);
      const id = entry['id'];
      if (typeof id !== 'string' || id === '') fail(file, `${where}.id must be a non-empty string`);
      if (ids.has(id)) fail(file, `duplicate rule id ${id}`);
      ids.add(id);
      const type = entry['type'];
      if (typeof type !== 'string' || !/^[A-Z_]+$/.test(type))
        fail(file, `${id}: type must be an upper-case TxType`);
      const rule: ProviderDefaultRule = { id, type, category_id: null, confidence: 0 };
      if ('direction' in entry) {
        const d = entry['direction'];
        if (typeof d !== 'string' || !(DIRECTIONS as readonly string[]).includes(d))
          fail(file, `${id}: direction must be in|out|none`);
        rule.direction = d as Direction;
      }
      if ('counterparty_kind' in entry) {
        const k = entry['counterparty_kind'];
        if (
          !isStringArray(k) ||
          k.length === 0 ||
          !k.every((v) => (COUNTERPARTY_KINDS as readonly string[]).includes(v))
        ) {
          fail(file, `${id}: counterparty_kind must be a non-empty array of CounterpartyKind`);
        }
        rule.counterparty_kind = k as CounterpartyKind[];
      }
      if ('provider' in entry) {
        const p = entry['provider'];
        if (!isStringArray(p) || p.length === 0)
          fail(file, `${id}: provider must be a non-empty array of strings`);
        rule.provider = p;
      }
      const category_id = entry['category_id'];
      if (
        category_id !== null &&
        (typeof category_id !== 'string' || !categoryIds.has(category_id))
      ) {
        fail(file, `${id}: category_id "${String(category_id)}" is not a taxonomy id`);
      }
      rule.category_id = category_id;
      const confidence = entry['confidence'];
      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1)
        fail(file, `${id}: confidence must be between 0 and 1`);
      if (category_id !== null && confidence <= 0)
        fail(file, `${id}: a rule with a category needs confidence > 0`);
      rule.confidence = confidence;
      if ('note' in entry) {
        if (typeof entry['note'] !== 'string') fail(file, `${id}: note must be a string`);
        rule.note = entry['note'];
      }
      return rule;
    },
  );
  return { version: raw['version'], rules };
}

const taxonomyFile = parseTaxonomy('taxonomy.json', readJson('taxonomy.json'));
const categoryIndex: ReadonlyMap<string, Category> = new Map(
  taxonomyFile.categories.map((c) => [c.id, c]),
);
const categoryIdSet: ReadonlySet<string> = new Set(categoryIndex.keys());
const merchantsFile = parseMerchants('merchants.json', readJson('merchants.json'), categoryIdSet);
const providerDefaultsFile = parseProviderDefaults(
  'provider-defaults.json',
  readJson('provider-defaults.json'),
  categoryIdSet,
);

// ---------------------------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------------------------

/** Version of the taxonomy data; bump `data/taxonomy.json` when ids are added. */
export const TAXONOMY_VERSION: number = taxonomyFile.version;
export const MERCHANTS_VERSION: number = merchantsFile.version;
export const PROVIDER_DEFAULTS_VERSION: number = providerDefaultsFile.version;

/** All categories in `sort` order. */
export const categories: readonly Category[] = Object.freeze(
  [...taxonomyFile.categories].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)),
);

export function categoryById(id: string): Category | undefined {
  return categoryIndex.get(id);
}

export function topLevelCategories(): Category[] {
  return categories.filter((c) => c.parent_id === null);
}

export function childrenOf(parentId: string): Category[] {
  return categories.filter((c) => c.parent_id === parentId);
}

/** The top-level category of `id` (itself when already top-level); undefined for unknown ids. */
export function topLevelOf(id: string): Category | undefined {
  const c = categoryIndex.get(id);
  if (!c) return undefined;
  return c.parent_id === null ? c : categoryIndex.get(c.parent_id);
}

/** Transfers are not spending; cash is untracked; income is inflow. Unknown ids are not spending (fail closed). */
export function isSpendingCategory(id: string): boolean {
  return categoryIndex.get(id)?.is_spending ?? false;
}

export function isHideableCategory(id: string): boolean {
  return categoryIndex.get(id)?.hideable ?? false;
}

/**
 * Categories every ledger has regardless of seeds: transfers are not spending and fees are first-class.
 * These are the legacy short names; `SYSTEM_CATEGORY_IDS` maps them to taxonomy ids.
 */
export const SYSTEM_CATEGORIES = ['uncategorised', 'transfer', 'fees'] as const;
export type SystemCategory = (typeof SYSTEM_CATEGORIES)[number];

export const SYSTEM_CATEGORY_IDS: Readonly<Record<SystemCategory, string>> = Object.freeze({
  uncategorised: 'uncategorised',
  transfer: 'transfers',
  fees: 'fees_charges',
});

export const UNCATEGORISED_ID = SYSTEM_CATEGORY_IDS.uncategorised;
export const TRANSFERS_ID = SYSTEM_CATEGORY_IDS.transfer;
export const FEES_ID = SYSTEM_CATEGORY_IDS.fees;

/** True for a legacy system-category name or for the taxonomy id it maps to. */
export function isSystemCategory(value: unknown): value is SystemCategory | string {
  if (typeof value !== 'string') return false;
  return (
    (SYSTEM_CATEGORIES as readonly string[]).includes(value) ||
    Object.values(SYSTEM_CATEGORY_IDS).includes(value)
  );
}

/** Taxonomy id for a legacy system-category name (`'transfer'` → `'transfers'`); ids pass through. */
export function systemCategoryId(value: SystemCategory | string): string | undefined {
  if ((SYSTEM_CATEGORIES as readonly string[]).includes(value))
    return SYSTEM_CATEGORY_IDS[value as SystemCategory];
  return Object.values(SYSTEM_CATEGORY_IDS).includes(value) ? value : undefined;
}

// ---------------------------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------------------------

export const merchants: readonly MerchantSeed[] = Object.freeze(merchantsFile.merchants);
const merchantIndex: ReadonlyMap<string, MerchantSeed> = new Map(merchants.map((m) => [m.id, m]));

export function merchantById(id: string): MerchantSeed | undefined {
  return merchantIndex.get(id);
}

/**
 * Upper-case, strip everything that is not a letter, digit or `&`, collapse whitespace.
 * "Naivas  Ltd. - Kilimani" → "NAIVAS LTD KILIMANI".
 */
export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9&\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseNumber(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = value.replace(/\D+/g, '');
  return digits === '' ? null : digits;
}

const CONFIDENCE_NUMBER = 0.95;
const CONFIDENCE_ALIAS_EXACT = 0.9;
const CONFIDENCE_ALIAS_PARTIAL = 0.8;

interface AliasEntry {
  alias: string;
  tokens: string[];
  merchant: MerchantSeed;
}

function indexNumbers(pick: (m: MerchantSeed) => string[]): ReadonlyMap<string, MerchantSeed[]> {
  const map = new Map<string, MerchantSeed[]>();
  for (const m of merchants) {
    for (const n of pick(m)) {
      const list = map.get(n) ?? [];
      list.push(m);
      map.set(n, list);
    }
  }
  return map;
}

const paybillIndex = indexNumbers((m) => m.paybills);
const tillIndex = indexNumbers((m) => m.tills);

/** Longest aliases first so "NAIVAS LTD" wins over "NAIVAS" and "KCB M-PESA" over "KCB". */
const aliasEntries: readonly AliasEntry[] = merchants
  .flatMap((merchant) =>
    merchant.aliases.map((alias) => ({ alias, tokens: alias.split(' '), merchant })),
  )
  .sort((a, b) => b.alias.length - a.alias.length || a.merchant.id.localeCompare(b.merchant.id));

function containsTokenSequence(haystack: readonly string[], needle: readonly string[]): number {
  // Returns the index at which `needle` occurs as a whole-token run inside `haystack`, or -1.
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

type AliasHit = { entry: AliasEntry; kind: 'exact' | 'prefix' | 'contains' };

function findAlias(normalised: string, among?: ReadonlySet<string>): AliasHit | null {
  if (normalised === '') return null;
  const tokens = normalised.split(' ');
  let best: AliasHit | null = null;
  for (const entry of aliasEntries) {
    if (among && !among.has(entry.merchant.id)) continue;
    if (entry.alias === normalised) return { entry, kind: 'exact' };
    const at = containsTokenSequence(tokens, entry.tokens);
    if (at === -1) continue;
    const kind = at === 0 ? 'prefix' : 'contains';
    // Entries are sorted longest first, so the first prefix hit is the best prefix hit; keep looking for an
    // exact match but prefer prefix over contains.
    if (best === null || (best.kind === 'contains' && kind === 'prefix')) best = { entry, kind };
  }
  return best;
}

/**
 * Match a counterparty against the merchant seeds: exact paybill, then exact till, then alias
 * (exact, then prefix, then whole-word contains; longest alias wins). When several merchants share a
 * number (KRA, NTSA and eCitizen all use 222222) the name disambiguates; otherwise the first seed wins.
 */
export function matchMerchant(lookup: MerchantLookup): MerchantMatch | null {
  const normalisedName = lookup.name ? normaliseName(lookup.name) : '';

  for (const [matched_by, index, raw] of [
    ['paybill', paybillIndex, lookup.paybill],
    ['till', tillIndex, lookup.till],
  ] as const) {
    const number = normaliseNumber(raw);
    if (number === null) continue;
    const candidates = index.get(number);
    if (!candidates || candidates.length === 0) continue;
    let merchant = candidates[0] as MerchantSeed;
    if (candidates.length > 1 && normalisedName !== '') {
      const hit = findAlias(normalisedName, new Set(candidates.map((m) => m.id)));
      if (hit) merchant = hit.entry.merchant;
    }
    return { merchant, matched_by, confidence: CONFIDENCE_NUMBER };
  }

  const hit = findAlias(normalisedName);
  if (!hit) return null;
  return {
    merchant: hit.entry.merchant,
    matched_by: 'alias',
    confidence: hit.kind === 'exact' ? CONFIDENCE_ALIAS_EXACT : CONFIDENCE_ALIAS_PARTIAL,
  };
}

// ---------------------------------------------------------------------------------------------
// Provider defaults
// ---------------------------------------------------------------------------------------------

export const providerDefaultRules: readonly ProviderDefaultRule[] = Object.freeze(
  providerDefaultsFile.rules,
);

function ruleMatches(rule: ProviderDefaultRule, lookup: ProviderDefaultLookup): boolean {
  if (rule.type !== lookup.type) return false;
  if (rule.direction !== undefined && rule.direction !== lookup.direction) return false;
  if (rule.counterparty_kind !== undefined) {
    if (
      lookup.counterparty_kind == null ||
      !rule.counterparty_kind.includes(lookup.counterparty_kind as CounterpartyKind)
    )
      return false;
  }
  if (rule.provider !== undefined) {
    if (lookup.provider == null || !rule.provider.includes(lookup.provider)) return false;
  }
  return true;
}

/**
 * The provider-type default for a transaction, or null when the type has no default (PAYBILL, BUY_GOODS,
 * DEBIT…) or is not a money movement (BALANCE_QUERY, FAILED). Rules are evaluated in file order; the
 * first match wins.
 */
export function providerDefaultCategory(lookup: ProviderDefaultLookup): ProviderDefault | null {
  for (const rule of providerDefaultRules) {
    if (!ruleMatches(rule, lookup)) continue;
    if (rule.category_id === null) return null;
    return { category_id: rule.category_id, confidence: rule.confidence, rule_id: rule.id };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Resolution (merchant table → provider default → none)
// ---------------------------------------------------------------------------------------------

/**
 * §7 order after the user's own rules: merchant table → provider default → none. The caller applies user
 * rules before and the model after; `source: 'none'` means "send to the model or leave Uncategorised".
 */
export function resolveCategory(input: ResolveCategoryInput): ResolvedCategory {
  const merchant = matchMerchant(input);
  if (merchant) {
    return {
      category_id: merchant.merchant.category_id,
      source: 'merchant',
      confidence: merchant.confidence,
      merchant_id: merchant.merchant.id,
    };
  }
  const fallback = providerDefaultCategory(input);
  if (fallback) {
    return {
      category_id: fallback.category_id,
      source: 'provider_default',
      confidence: fallback.confidence,
      rule_id: fallback.rule_id,
    };
  }
  return { category_id: null, source: 'none', confidence: 0 };
}
