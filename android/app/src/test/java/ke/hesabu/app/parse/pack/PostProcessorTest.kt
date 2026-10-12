package ke.hesabu.app.parse.pack

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** PROVIDER-PACKS.md "Dedupe and transfers". */
class PostProcessorTest {

    data class Row(
        override val id: String,
        override val accountRef: String = "mpesa:a",
        override val provider: String = "mpesa",
        override val externalRef: String? = null,
        override val familyId: String = "fam",
        override val rawHash: String = id,
        override val type: String = "SEND_MONEY",
        override val direction: String = "out",
        override val counterpartyKind: String = "person",
        override val isTransferHint: Boolean = false,
        override val amountCents: Long = 100_00,
        override val feeCents: Long = 0,
        override val balanceAfterCents: Long? = null,
        override val occurredAtMillis: Long = 0,
    ) : PostProcessor.LedgerLike

    @Test
    fun dedupeUsesExternalRefThenRawHash() {
        val rows = listOf(
            Row("1", externalRef = "ABC"),
            Row("2", externalRef = "ABC", rawHash = "different"),
            Row("3", rawHash = "h1"),
            Row("4", rawHash = "h1"),
            Row("5", externalRef = "ABC", provider = "airtel_money"),
            Row("6", externalRef = "ABC", familyId = "fuliza_drawdown"), // same code, different family: kept
        )
        val d = PostProcessor.dedupe(rows)
        assertEquals(listOf("1", "3", "5", "6"), d.kept.map { it.id })
        assertEquals(2, d.droppedCount)
        val again = PostProcessor.dedupe(listOf(Row("6", externalRef = "ABC")), existingKeys = d.kept.map(PostProcessor::dedupeKey).toSet())
        assertEquals(0, again.kept.size)
        assertEquals(1, again.droppedCount)
    }

    @Test
    fun transfersPairOppositeDirectionsAcrossAccountsWithinTenMinutes() {
        val min = 60_000L
        val rows = listOf(
            Row("out", accountRef = "mpesa:a", direction = "out", amountCents = 5_000_00, isTransferHint = true, occurredAtMillis = 0),
            Row("in", accountRef = "bank:eq", direction = "in", amountCents = 5_000_00, occurredAtMillis = 9 * min),
            Row("late", accountRef = "bank:eq", direction = "in", amountCents = 5_000_00, occurredAtMillis = 11 * min),
            Row("sameacct", accountRef = "mpesa:a", direction = "in", amountCents = 5_000_00, isTransferHint = true, occurredAtMillis = 1 * min),
            Row("nohint", accountRef = "bank:kcb", direction = "in", amountCents = 7_00, occurredAtMillis = 0),
            Row("nohint2", accountRef = "mpesa:a", direction = "out", amountCents = 7_00, occurredAtMillis = 0),
            Row("w", accountRef = "mpesa:a", direction = "out", type = "WITHDRAW", amountCents = 2_000_00, counterpartyKind = "agent", occurredAtMillis = 0),
            Row("cash", accountRef = "cash", direction = "in", amountCents = 2_000_00, counterpartyKind = "self", occurredAtMillis = 0),
        )
        val pairs = PostProcessor.pairIds(rows)
        assertEquals(setOf("out", "in"), pairs.keys)
        assertEquals(pairs["out"], pairs["in"])
        assertEquals(Ids.transferPairId("out", "in"), pairs["out"])
    }

    @Test
    fun closestCandidateWinsEvenWhenItArrivedEarlier() {
        val rows = listOf(
            Row("in-early", accountRef = "bank:x", direction = "in", amountCents = 100, counterpartyKind = "bank", occurredAtMillis = 0),
            Row("out", accountRef = "mpesa:a", direction = "out", amountCents = 100, occurredAtMillis = 60_000),
            Row("in-late", accountRef = "bank:y", direction = "in", amountCents = 100, counterpartyKind = "bank", occurredAtMillis = 300_000),
        )
        val pairs = PostProcessor.matchTransfers(rows)
        assertEquals(1, pairs.size)
        assertEquals("in-early", pairs[0].inId)
    }

    @Test
    fun fulizaDrawdownIsAppliedBeforeThePaymentItFunded() {
        // 1,000 balance; a 1,500 payment funded by a 500 Fuliza drawdown (no balance, same code, fee on the loan).
        val rows = listOf(
            Row("start", direction = "in", amountCents = 1_000_00, balanceAfterCents = 1_000_00, occurredAtMillis = 1),
            Row("pay", externalRef = "ABC", direction = "out", amountCents = 1_500_00, feeCents = 0, balanceAfterCents = 0, occurredAtMillis = 2),
            Row("fuliza", externalRef = "ABC", familyId = "fuliza_drawdown", type = "FULIZA_DRAWDOWN", direction = "in", amountCents = 500_00, feeCents = 5_00, balanceAfterCents = null, occurredAtMillis = 3),
        )
        assertEquals(emptyList<PostProcessor.BalanceBreak>(), PostProcessor.checkBalanceChain(rows))
    }

    @Test
    fun bankCounterpartyKindIsEnoughOfAHint() {
        val rows = listOf(
            Row("a", accountRef = "mpesa:a", direction = "out", amountCents = 100, counterpartyKind = "bank"),
            Row("b", accountRef = "bank:x", direction = "in", amountCents = 100, occurredAtMillis = 1000),
            Row("c", accountRef = "bank:y", direction = "in", amountCents = 100, occurredAtMillis = 2000),
        )
        val pairs = PostProcessor.pairIds(rows)
        assertEquals(setOf("a", "b"), pairs.keys)
        assertNotEquals(null, pairs["a"])
    }

    @Test
    fun balanceChainFlagsBreaksAndNeverAltersAmounts() {
        val rows = listOf(
            Row("1", direction = "in", amountCents = 1_000_00, balanceAfterCents = 5_000_00, occurredAtMillis = 1),
            Row("2", direction = "out", amountCents = 500_00, feeCents = 23_00, balanceAfterCents = 4_477_00, occurredAtMillis = 2),
            Row("3", direction = "out", amountCents = 100_00, balanceAfterCents = 4_000_00, occurredAtMillis = 3), // missed message in between
            Row("4", direction = "none", type = "BALANCE_QUERY", feeCents = 0, amountCents = 0, balanceAfterCents = 4_000_00, occurredAtMillis = 4),
            Row("other", accountRef = "bank:x", direction = "in", amountCents = 1, balanceAfterCents = 1, occurredAtMillis = 5),
            Row("nobal", direction = "out", amountCents = 1, balanceAfterCents = null, occurredAtMillis = 6),
        )
        val breaks = PostProcessor.checkBalanceChain(rows)
        assertEquals(1, breaks.size)
        assertEquals("3", breaks[0].id)
        assertEquals("2", breaks[0].previousId)
        assertEquals(4_377_00L, breaks[0].expectedCents)
        assertEquals(4_000_00L, breaks[0].actualCents)
        assertTrue(rows.all { it.amountCents >= 0 })
    }
}
