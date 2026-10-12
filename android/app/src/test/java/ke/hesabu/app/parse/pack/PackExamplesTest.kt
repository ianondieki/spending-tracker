package ke.hesabu.app.parse.pack

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * "Examples are the tests": every example of every family in every pack (built-in and, after merging, the
 * contract packs) runs through the real engine and its `expect` block must hold. Also asserts the ordering rule:
 * an example must be parsed by its own family, so a less specific family earlier in the pack is a failure.
 */
@RunWith(Parameterized::class)
class PackExamplesTest(
    private val pack: ProviderPack,
    private val family: Family,
    private val exampleIndex: Int,
    @Suppress("unused") private val name: String,
) {

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{3}")
        fun cases(): List<Array<Any>> {
            val packs = TestPacks.allPacks()
            check(packs.isNotEmpty()) { "no packs found; the built-in pack must exist" }
            return packs.flatMap { p ->
                p.families.flatMap { f ->
                    f.examples.indices.map { i -> arrayOf<Any>(p, f, i, "${p.packId}/${f.familyId}[$i]") }
                }
            }
        }
    }

    private val received = 1_760_000_000_000L

    @Test
    fun exampleParsesAsExpected() {
        val engine = PackEngine(listOf(pack), mapOf("sim_msisdn_masked" to "07XXXXX000", "acct_mask" to "***000"))
        val ex = family.examples[exampleIndex]
        val result = engine.parse(InboundMessage(pack.senderIds.first(), ex.body, received))
        if (family.ignore) {
            assertEquals(ParseResult.Ignored(pack.packId, pack.version, family.familyId), result)
            return
        }
        assertTrue("expected Parsed but got $result", result is ParseResult.Parsed)
        val tx = (result as ParseResult.Parsed).transaction
        assertEquals("parsed by the wrong family", family.familyId, tx.familyId)
        val e = ex.expect
        fun str(k: String) = e[k]?.let { if (it is JsonNull) null else it.jsonPrimitive.content }
        fun num(k: String) = e[k]?.let { if (it is JsonNull) null else it.jsonPrimitive.longOrNull }
        assertEquals("amount_cents", num("amount_cents"), tx.amountCents)
        if ("fee_cents" in e) assertEquals("fee_cents", num("fee_cents"), tx.feeCents)
        if ("balance_after_cents" in e) assertEquals("balance_after_cents", num("balance_after_cents"), tx.balanceAfterCents)
        if ("external_ref" in e) assertEquals("external_ref", str("external_ref"), tx.externalRef)
        if ("occurred_at" in e) assertEquals("occurred_at", str("occurred_at"), tx.occurredAt)
        if ("counterparty_name" in e) assertEquals("counterparty_name", str("counterparty_name"), tx.counterpartyName)
        assertEquals(family.type, tx.type)
        assertEquals(family.direction, tx.direction)
        assertEquals(pack.provider, tx.provider)
        assertTrue(tx.accountRef.isNotBlank() && !tx.accountRef.contains('{'))
    }

    @Test
    fun verifiedExamplesOnlyComeFromTheCorpus() {
        // A built-in (Lane A) pack may never claim a verified body; contract packs are checked by Lane D's CI.
        if (pack.packId.endsWith("_builtin")) assertTrue(!family.examples[exampleIndex].verified)
    }
}
