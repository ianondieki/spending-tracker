export const TAXONOMY_VERSION = 0 as const;

/** Categories every ledger has regardless of seeds: transfers are not spending and fees are first-class. */
export const SYSTEM_CATEGORIES = ['uncategorised', 'transfer', 'fees'] as const;
export type SystemCategory = (typeof SYSTEM_CATEGORIES)[number];

export function isSystemCategory(value: unknown): value is SystemCategory {
  return typeof value === 'string' && (SYSTEM_CATEGORIES as readonly string[]).includes(value);
}
