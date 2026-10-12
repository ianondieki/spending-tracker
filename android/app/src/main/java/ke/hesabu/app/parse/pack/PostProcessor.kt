package ke.hesabu.app.parse.pack

import kotlin.math.abs

/**
 * The cross-pack rules from PROVIDER-PACKS.md, pure and testable, mirroring packages/pack-engine/src/postprocess.ts:
 * dedupe, transfer matching, balance chain. Works on any ledger row through [LedgerLike] so the database layer and
 * the engine tests share it.
 */
object PostProcessor {

    interface LedgerLike {
        val id: String
        val provider: String
        val externalRef: String?
        val familyId: String
        val rawHash: String
        val accountRef: String
        val type: String
        val direction: String
        val counterpartyKind: String
        val isTransferHint: Boolean
        val amountCents: Long
        val feeCents: Long
        val balanceAfterCents: Long?
        val occurredAtMillis: Long
        /** Arrival order tie-break for the balance chain. */
        val receivedAtMillis: Long get() = occurredAtMillis
    }

    /** `(provider, external_ref, family_id)` when there is an external ref, otherwise the raw hash. */
    fun dedupeKey(t: LedgerLike): String =
        if (!t.externalRef.isNullOrBlank()) refKey(t.provider, t.externalRef!!, t.familyId) else "hash|${t.rawHash}"

    fun refKey(provider: String, externalRef: String, familyId: String) = "$provider|$externalRef|$familyId"

    data class Deduped<T : LedgerLike>(val kept: List<T>, val droppedCount: Int)

    /** Keeps the first occurrence of each key, in input order. [existingKeys] are rows already in the ledger. */
    fun <T : LedgerLike> dedupe(rows: List<T>, existingKeys: Set<String> = emptySet()): Deduped<T> {
        val seen = HashSet(existingKeys)
        val kept = ArrayList<T>()
        var dropped = 0
        for (r in rows) if (seen.add(dedupeKey(r))) kept.add(r) else dropped++
        return Deduped(kept, dropped)
    }

    const val TRANSFER_WINDOW_MS: Long = 10 * 60 * 1000
    private val neverPaired = setOf("WITHDRAW", "ATM")
    private val ownSide = setOf("self", "bank")

    data class Pair(val pairId: String, val outId: String, val inId: String)

    /**
     * Pairs an `out` and an `in` from different accounts: equal amount, within 10 minutes either way, and at least one
     * side carries a transfer hint or has counterparty kind self or bank. Each row joins at most one pair; for each
     * `out` in time order the closest `in` wins. The pair id derives from the two ids.
     */
    fun matchTransfers(rows: List<LedgerLike>): List<Pair> {
        val sorted = rows.sortedBy { it.occurredAtMillis }
        val paired = HashSet<String>()
        val pairs = ArrayList<Pair>()
        for (a in sorted) {
            if (a.id in paired || a.direction != "out" || a.type in neverPaired) continue
            var best: LedgerLike? = null
            var bestDelta = Long.MAX_VALUE
            for (b in sorted) {
                if (b.id in paired || b.direction != "in" || b.type in neverPaired) continue
                if (b.accountRef == a.accountRef || b.amountCents != a.amountCents) continue
                val delta = abs(b.occurredAtMillis - a.occurredAtMillis)
                if (delta > TRANSFER_WINDOW_MS) continue
                if (!(a.isTransferHint || b.isTransferHint || a.counterpartyKind in ownSide || b.counterpartyKind in ownSide)) continue
                if (delta < bestDelta) { best = b; bestDelta = delta }
            }
            val b = best ?: continue
            val pairId = Ids.transferPairId(a.id, b.id)
            paired.add(a.id); paired.add(b.id)
            pairs.add(Pair(pairId, a.id, b.id))
        }
        return pairs
    }

    /** id → pair id, for callers that update rows. */
    fun pairIds(rows: List<LedgerLike>): Map<String, String> =
        matchTransfers(rows).flatMap { listOf(it.outId to it.pairId, it.inId to it.pairId) }.toMap()

    data class BalanceBreak(val accountRef: String, val previousId: String, val id: String, val expectedCents: Long, val actualCents: Long)

    /** Fees whose charge lands on the loan, not on the account the message belongs to. */
    private val feeNotFromAccount = setOf("FULIZA_DRAWDOWN")

    /**
     * Per account, in time order, `prev.balance ± amount ∓ fee` must equal the next balance. A row without a balance
     * still moves the running balance. Rows sharing an external ref are one event: a balance-less sibling (a Fuliza
     * drawdown) is applied before the balance-carrying one. Breaks are advisory and never alter a row.
     */
    fun checkBalanceChain(rows: List<LedgerLike>): List<BalanceBreak> {
        val breaks = ArrayList<BalanceBreak>()
        rows.groupBy { it.accountRef }.forEach { (account, list) ->
            var running: Long? = null
            var prevId: String? = null
            for (t in orderForChain(list)) {
                if (running != null) {
                    running = applyDelta(running, t)
                    val actual = t.balanceAfterCents
                    if (actual != null && running != actual) breaks.add(BalanceBreak(account, prevId!!, t.id, running, actual))
                }
                if (t.balanceAfterCents != null) { running = t.balanceAfterCents; prevId = t.id }
            }
        }
        return breaks
    }

    private fun applyDelta(balance: Long, t: LedgerLike): Long {
        val fee = if (t.type in feeNotFromAccount) 0L else t.feeCents
        return when (t.direction) {
            "in" -> balance + t.amountCents - fee
            "out" -> balance - t.amountCents - fee
            else -> balance
        }
    }

    private fun orderForChain(list: List<LedgerLike>): List<LedgerLike> {
        val sorted = list.sortedWith(compareBy({ it.occurredAtMillis }, { it.receivedAtMillis }, { it.id }))
        val result = ArrayList<LedgerLike>()
        val placed = HashSet<String>()
        for (t in sorted) {
            if (t.id in placed) continue
            if (t.externalRef != null && t.balanceAfterCents != null) {
                for (s in sorted) {
                    if (s.id !in placed && s.id != t.id && s.externalRef == t.externalRef && s.balanceAfterCents == null) {
                        result.add(s); placed.add(s.id)
                    }
                }
            }
            result.add(t); placed.add(t.id)
        }
        return result
    }
}
