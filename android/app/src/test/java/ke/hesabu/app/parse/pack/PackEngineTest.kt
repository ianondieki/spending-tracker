package ke.hesabu.app.parse.pack

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PROVIDER-PACKS.md §1 to §7 against the inline test pack. */
class PackEngineTest {

    private val engine = PackEngine(listOf(TestPacks.inlinePack), deviceVars = mapOf("sim_msisdn_masked" to "07XXXXX123"))
    private val received = 1_760_000_000_000L // 2025-10-09T08:53:20+03:00

    private fun msg(body: String, sender: String = "TESTPAY") = InboundMessage(sender, body, received)

    @Test
    fun senderFilterTrimsAndIgnoresCase() {
        assertTrue(engine.isKnownSender("testpay"))
        assertTrue(engine.isKnownSender("  TPay "))
        assertEquals(ParseResult.NotMoneySender, engine.parse(msg("ABC1234567 Confirmed. Ksh1.00 sent to X for account 1 on 1/1/26 at 1:00 PM. Balance Ksh1.00.", sender = "MUM")))
        assertEquals(setOf("testpay", "tpay"), engine.knownSenders)
    }

    @Test
    fun firstMatchingFamilyWinsAndFieldsNormalise() {
        val r = engine.parse(msg("ABC1234567 Confirmed. Ksh1,200.00 sent to KPLC   PREPAID for account 0712345678 on 12/10/26 at 2:45 PM. Balance Ksh300.00. Cost Ksh23.00."))
        val tx = (r as ParseResult.Parsed).transaction
        assertEquals("pay", tx.familyId)
        assertEquals("test_pack", tx.packId)
        assertEquals("1.2.3", tx.packVersion)
        assertEquals("ABC1234567", tx.externalRef)
        assertEquals(120_000L, tx.amountCents)
        assertEquals(2_300L, tx.feeCents)
        assertEquals(30_000L, tx.balanceAfterCents)
        assertEquals("2026-10-12T14:45:00+03:00", tx.occurredAt)
        assertEquals("KPLC PREPAID", tx.counterpartyName)
        assertEquals("07XXXXX678", tx.counterpartyAccountRef) // looks like a phone, so masked
        assertEquals("mpesa:07XXXXX123", tx.accountRef)
        assertEquals("PAYBILL", tx.type)
        assertEquals("out", tx.direction)
        assertEquals("paybill", tx.counterpartyKind)
        assertEquals(0.9, tx.parseConfidence, 0.0)
        assertEquals("utilities", tx.defaultCategoryId)
        assertEquals(msg("").let { InboundMessage.sha256("ABC1234567 Confirmed. Ksh1,200.00 sent to KPLC   PREPAID for account 0712345678 on 12/10/26 at 2:45 PM. Balance Ksh300.00. Cost Ksh23.00.") }, tx.rawHash)
    }

    @Test
    fun missingOptionalFeeFallsBackToDefaults() {
        val r = engine.parse(msg("ABC1234567 Confirmed. Ksh1,200.00 sent to KPLC for account 123 on 12/10/26 at 2:45 PM. Balance Ksh300.00."))
        val tx = (r as ParseResult.Parsed).transaction
        assertEquals(500L, tx.feeCents)
        assertEquals("123", tx.counterpartyAccountRef)
    }

    @Test
    fun prefilterNoneOfSkipsTheFamily() {
        // "reversed" is in none_of for "pay"; "send" then fails (no phone) so the message is unknown.
        val r = engine.parse(msg("ABC1234567 Confirmed. Ksh1,200.00 sent to KPLC for account 123 on 12/10/26 at 2:45 PM. Balance Ksh300.00. reversed"))
        assertEquals(ParseResult.Unknown(listOf("test_pack")), r)
    }

    @Test
    fun requiredGroupMissingMovesToNextFamily() {
        // No "for account", so "pay" fails; "send" matches with a phone.
        val r = engine.parse(msg("ABC1234568 Confirmed. Ksh50.00 sent to Jane W +254712345678 on 1/1/26 at 9:05 AM"))
        val tx = (r as ParseResult.Parsed).transaction
        assertEquals("send", tx.familyId)
        assertEquals("07XXXXX678", tx.counterpartyRef)
        assertEquals(0L, tx.feeCents)
        assertNull(tx.balanceAfterCents)
        assertEquals("2026-01-01T09:05:00+03:00", tx.occurredAt)
    }

    @Test
    fun ignoreFamiliesConsumeWithoutTransaction() {
        val r = engine.parse(msg("X Confirmed. Your balance was Ksh10.00 on today")) as ParseResult.Ignored
        assertEquals("balance", r.familyId)
        assertEquals(1_000L, r.balanceAfterCents)
        assertNull(r.amountCents)
    }

    @Test
    fun unknownWhenNoFamilyMatches() {
        assertEquals(ParseResult.Unknown(listOf("test_pack")), engine.parse(msg("Welcome to TestPay! Dial *123#")))
    }

    @Test
    fun occurredAtFallsBackToReceivedTimeWhenTheMessageHasNoDate() {
        val tx = (engine.parse(msg("You have received KES 50 from your bank")) as ParseResult.Parsed).transaction
        assertEquals(5_000L, tx.amountCents)
        assertEquals(Normalisers.epochMillisToIso(received), tx.occurredAt)
        assertEquals(received, tx.occurredAtMillis)
        assertTrue(tx.isTransferHint)
        assertEquals("bank", tx.counterpartyKind)
    }

    @Test
    fun missingDeviceVariableStillGivesAStableAccountRef() {
        val bare = PackEngine(listOf(TestPacks.inlinePack))
        val tx = (bare.parse(msg("You have received KES 50 from your bank")) as ParseResult.Parsed).transaction
        assertEquals("mpesa:default", tx.accountRef)
    }

    @Test
    fun unknownJsonKeysAreRejected() {
        val bad = TestPacks.inlinePackJson.replaceFirst("\"version\"", "\"colour\": \"blue\", \"version\"")
        val result = runCatching { PackLoader.fromJson(bad) }
        assertTrue(result.isFailure)
    }

    @Test
    fun fieldNamingAGroupThatIsNotInThePatternFailsToLoad() {
        val bad = TestPacks.inlinePackJson.replace("\"phone\": {\"to\": \"counterparty_ref\"", "\"fone\": {\"to\": \"counterparty_ref\"")
        val result = runCatching { PackLoader.validate(PackLoader.fromJson(bad)) }
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("fone"))
    }

    @Test
    fun mergePrefersContractPacksOverBuiltinForTheSameSender() {
        val contract = TestPacks.inlinePack.copy(packId = "mpesa_official", senderIds = listOf("MPESA"))
        val builtin = TestPacks.builtinPacks()
        val merged = PackLoader.merge(listOf(contract), builtin)
        assertEquals(listOf("mpesa_official"), merged.map { it.packId })
        val mergedUnrelated = PackLoader.merge(listOf(TestPacks.inlinePack), builtin)
        assertEquals(listOf("test_pack", "mpesa_builtin"), mergedUnrelated.map { it.packId })
    }
}
