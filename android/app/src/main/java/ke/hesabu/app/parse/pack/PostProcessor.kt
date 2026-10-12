package ke.hesabu.app.parse.pack

import java.util.UUID

/**
 * The cross-pack rules from PROVIDER-PACKS.md, pure and testable: dedupe, transfer matching, balance chain.
 * Works on any ledger row through [LedgerLike] so the database layer and the engine tests share it.
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
    }

    /**
     * `(provider, external_ref, family_id)` when there is an external ref, otherwise the raw hash. The family is part
     * of the key because M-Pesa reuses one code across related messages (a Fuliza drawdown repeats the code of the
     * payment it funded; a reversal cites the original).
     */
    fun dedupeKey(t: LedgerLike): String =
        if (!t.externalRef.isNullOrBlank()) refKey(t.provider, t.externalRef!!, t.familyId) else "hash:${t.rawHash}"

    fun refKey(provider: String, externalRef: String, familyId: String) = "ref:$provider:$externalRef:$familyId"

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

    /** Transfer pairs: id → shared pair id. Rows not in the map are not transfers (by this rule). */
    fun matchTransfers(rows: List<LedgerLike>, pairIdFor: (LedgerLike, LedgerLike) -> String = { a, _ -> UUID.nameUUIDFromBytes(a.id.toByteArray()).toString() }): Map<String, String> {
        val sorted = rows.filter { it.type !in neverPaired && it.direction != "none" }.sortedBy { it.occurredAtMillis }
        val paired = HashMap<String, String>()
        for (i in sorted.indices) {
            val a = sorted[i]
            if (a.id in paired) continue
            for (j in i + 1 until sorted.size) {
                val b = sorted[j]
                if (b.occurredAtMillis - a.occurredAtMillis > TRANSFER_WINDOW_MS) break
                if (b.id in paired) continue
                if (!isPair(a, b)) continue
                val pairId = pairIdFor(a, b)
                paired[a.id] = pairId
                paired[b.id] = pairId
                break
            }
        }
        return paired
    }

    private fun isPair(a: LedgerLike, b: LedgerLike): Boolean {
        if (a.accountRef == b.accountRef) return false
        if (a.direction == b.direction) return false
        if (a.amountCents != b.amountCents) return false
        val hinted = a.isTransferHint || b.isTransferHint ||
            a.counterpartyKind in selfOrBank || b.counterpartyKind in selfOrBank
        return hinted
    }

    private val selfOrBank = setOf("self", "bank")

    data class BalanceBreak(val accountRef: String, val previousId: String, val id: String, val expectedCents: Long, val actualCents: Long)

    /**
     * For each account whose rows carry `balance_after`, consecutive rows (by time) must satisfy
     * prev.balance ± amount ± fee = this.balance, sign by direction. Returns the breaks; advisory only.
     */
    fun checkBalanceChain(rows: List<LedgerLike>): List<BalanceBreak> {
        val breaks = ArrayList<BalanceBreak>()
        rows.filter { it.balanceAfterCents != null }
            .groupBy { it.accountRef }
            .forEach { (account, list) ->
                val ordered = list.sortedWith(compareBy({ it.occurredAtMillis }, { it.id }))
                for (i in 1 until ordered.size) {
                    val prev = ordered[i - 1]
                    val cur = ordered[i]
                    val expected = prev.balanceAfterCents!! + when (cur.direction) {
                        "in" -> cur.amountCents - cur.feeCents
                        "out" -> -(cur.amountCents + cur.feeCents)
                        else -> -cur.feeCents
                    }
                    val actual = cur.balanceAfterCents!!
                    if (expected != actual) breaks.add(BalanceBreak(account, prev.id, cur.id, expected, actual))
                }
            }
        return breaks
    }
}
