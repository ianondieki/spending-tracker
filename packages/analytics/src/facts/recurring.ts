/**
 * Recurring payments over the whole supplied window: a merchant with at least three spending payments within
 * ±20% of the median of all its payments. Cadence comes from the median gap in Nairobi calendar days.
 */
import type { RecurringFact } from '../contracts/facts-sheet.js';
import { money } from '../money.js';
import { daysBetween } from '../period.js';
import { isMerchantTx } from './breakdowns.js';
import type { Tx } from './prepare.js';
import { DAY_MS, drill, groupBy, isoNairobi, median, medianCents } from './util.js';

export interface RecurringItem {
  readonly fact: RecurringFact;
  readonly nextMs: number | null;
  readonly typical: number;
}

const BANDS = { weekly: [5, 9], monthly: [26, 35] } as const;
const NEXT_DAYS = { weekly: 7, monthly: 30 } as const;

function within(amount: number, ref: number, inversePct: number): boolean {
  // |amount - ref| <= ref / inversePct, in integers: 20% -> inversePct 5, 2% -> 50.
  return Math.abs(amount - ref) * inversePct <= ref;
}

export function findRecurring(windowSpend: readonly Tx[]): RecurringItem[] {
  const items: RecurringItem[] = [];
  for (const txs of groupBy(windowSpend.filter(isMerchantTx), (t) => t.key).values()) {
    if (txs.length < 3) continue;
    const m0 = medianCents(txs.map((t) => t.amount));
    if (m0 <= 0) continue;
    const kept = txs.filter((t) => within(t.amount, m0, 5));
    const last = kept[kept.length - 1];
    const first = kept[0];
    if (kept.length < 3 || !last || !first) continue;
    const typical = medianCents(kept.map((t) => t.amount));
    const gaps: number[] = [];
    for (let i = 1; i < kept.length; i++) {
      const a = kept[i - 1];
      const b = kept[i];
      if (a && b) gaps.push(daysBetween(a.local, b.local));
    }
    const mg = median(gaps);
    const cadence: RecurringFact['cadence'] =
      mg >= BANDS.weekly[0] && mg <= BANDS.weekly[1] ? 'weekly' : mg >= BANDS.monthly[0] && mg <= BANDS.monthly[1] ? 'monthly' : 'irregular';
    let confidence = 0;
    let nextMs: number | null = null;
    if (cadence !== 'irregular') {
      const [lo, hi] = BANDS[cadence];
      const inBand = gaps.filter((g) => g >= lo && g <= hi).length;
      confidence = Math.round((inBand / gaps.length) * 100) / 100;
      nextMs = last.ms + NEXT_DAYS[cadence] * DAY_MS;
    }
    const name = first.name ?? first.key ?? '';
    items.push({
      typical,
      nextMs,
      fact: {
        merchant: name,
        category_id: last.categoryId,
        cadence,
        typical_amount: money(typical),
        last_paid: last.src.occurred_at,
        next_expected: nextMs === null ? null : isoNairobi(nextMs),
        confidence,
        is_subscription: cadence !== 'irregular' && kept.every((t) => within(t.amount, typical, 50)),
        drilldown: drill({ merchant: name, transaction_ids: kept.map((t) => t.id) }),
      },
    });
  }
  return items.sort((a, b) => {
    if (a.nextMs === null) return b.nextMs === null ? 0 : 1;
    if (b.nextMs === null) return -1;
    return a.nextMs - b.nextMs;
  });
}
