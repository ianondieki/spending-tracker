package ke.hesabu.app.ingest

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.InsecureTestBodyCipher
import ke.hesabu.app.data.MerchantSeedEntity
import ke.hesabu.app.data.UserRuleEntity
import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.TestPacks
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The whole pipeline against an in-memory ledger: dedupe, categories, accounts, transfers, balance chain, unknowns. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IngestPipelineTest {

    private lateinit var db: HesabuDatabase
    private lateinit var pipeline: IngestPipeline
    private val cipher = InsecureTestBodyCipher()
    private var clock = 1_760_000_000_000L
    private var ids = 0

    @Before
    fun setUp() {
        db = HesabuDatabase.inMemory(ApplicationProvider.getApplicationContext<Context>())
        // The inline pack doubles as a bank here so that transfers cross account boundaries.
        val bank = TestPacks.inlinePack.copy(packId = "bank_test", provider = "bank", accountRefTemplate = "bank:test:{acct_mask}")
        val engine = PackEngine(TestPacks.builtinPacks() + bank, mapOf("sim_msisdn_masked" to "07XXXXX123", "acct_mask" to "***456"))
        pipeline = IngestPipeline(db, engine, cipher, now = { clock }, newId = { "id-${++ids}" })
    }

    @After
    fun tearDown() = db.close()

    private fun sms(body: String, sender: String = "MPESA", at: Long = clock) = InboundMessage(sender, body, at, MessageSource.Sms)

    private val send = "QJK3X8Y2M1 Confirmed. Ksh1,200.00 sent to JANE WANJIKU 0712 345678 on 12/10/26 at 2:45 PM. New M-PESA balance is Ksh3,450.00. Transaction cost, Ksh23.00. Amount you can transact within the day is 499,800.00."
    private val buyGoods = "QJK3X8Y2M4 Confirmed. Ksh450.00 paid to NAIVAS SUPERMARKET. on 12/10/26 at 1:20 PM.New M-PESA balance is Ksh4,673.00. Transaction cost, Ksh0.00."

    @Test
    fun parsesStoresAndCountsEverything() = runTest {
        db.merchantSeedDao().upsertAll(listOf(MerchantSeedEntity("s1", "name", "naivas", "Naivas", "groceries", 0.9)))
        val report = pipeline.ingest(listOf(sms(buyGoods), sms(send), sms("Hello mum", sender = "+254700000000"), sms("Some promo from Safaricom"), sms("QJK3X8Y2N0 Confirmed. Your M-PESA balance was Ksh3,450.00 on 12/10/26 at 3:00 PM. Transaction cost, Ksh0.00.")))
        assertEquals(5, report.received)
        assertEquals(2, report.parsed)
        assertEquals(1, report.ignored)
        assertEquals(1, report.unknown)
        assertEquals(1, report.notMoneySender)
        assertEquals(0, report.duplicates)
        assertEquals(mapOf("mpesa" to 2), report.perSender)

        val rows = db.transactionDao().between(0, Long.MAX_VALUE)
        assertEquals(2, rows.size)
        val naivas = rows.first { it.familyId == "buy_goods" }
        assertEquals("groceries", naivas.categoryId)
        assertEquals("merchant", naivas.categorySource)
        assertEquals("mpesa:07XXXXX123", naivas.accountRef)
        val jane = rows.first { it.familyId == "send_money" }
        assertNull(jane.categoryId)
        assertEquals("none", jane.categorySource)
        assertEquals(2_300L, jane.feeCents)
        assertEquals("07XXXXX678", jane.counterpartyRefMasked)

        val account = db.accountDao().byRef("mpesa:07XXXXX123")!!
        assertEquals("M-PESA", account.label)
        assertEquals(345_000L, account.lastBalanceCents) // the 2:45 PM message is the latest with a balance

        assertEquals(1, db.unknownMessageDao().pendingCount())
        assertEquals(2, db.syncQueueDao().count())
    }

    @Test
    fun duplicatesAreDroppedAcrossRunsAndWithinABatch() = runTest {
        val first = pipeline.ingest(listOf(sms(send), sms(send)))
        assertEquals(1, first.parsed)
        assertEquals(1, first.duplicates)
        // Same external ref, slightly different body (e.g. a trailing promo line): still the same transaction.
        val second = pipeline.ingest(sms("$send Dial *334#"))
        assertEquals(0, second.parsed)
        assertEquals(1, second.duplicates)
        assertEquals(1, db.transactionDao().count())
    }

    @Test
    fun userRuleBeatsMerchantSeedAndProviderDefault() = runTest {
        db.merchantSeedDao().upsertAll(listOf(MerchantSeedEntity("s1", "name", "naivas supermarket", "Naivas", "groceries", 0.9)))
        db.userRuleDao().upsert(UserRuleEntity("r1", "name", "NAIVAS SUPERMARKET", "shopping", createdAtMillis = clock))
        pipeline.ingest(sms(buyGoods))
        val row = db.transactionDao().between(0, Long.MAX_VALUE).single()
        assertEquals("shopping", row.categoryId)
        assertEquals("user", row.categorySource)
        assertEquals(1.0, row.categoryConfidence, 0.0)
    }

    @Test
    fun providerDefaultAppliesWhenNothingElseMatches() = runTest {
        pipeline.ingest(sms("QJK3X8Y2M7 Confirmed.You bought Ksh100.00 of airtime on 12/10/26 at 8:00 AM.New M-PESA balance is Ksh6,550.00. Transaction cost, Ksh0.00."))
        val row = db.transactionDao().between(0, Long.MAX_VALUE).single()
        assertEquals("airtime_data", row.categoryId)
        assertEquals("provider_default", row.categorySource)
    }

    @Test
    fun transfersArePairedAcrossAccountsAndQueuedAgain() = runTest {
        // M-Shwari deposit (transfer hint) from the builtin pack, and a matching credit from the inline "bank" pack.
        val out = "QJK3X8Y2M8 Confirmed.Ksh1,000.00 transferred to M-Shwari account on 12/10/26 at 6:00 PM. M-PESA balance is Ksh5,550.00. M-Shwari balance is Ksh12,000.00. Transaction cost Ksh0.00."
        val r1 = pipeline.ingest(sms(out))
        assertEquals(0, r1.transfersPaired)
        // The inline pack has no date for bank_in, so occurred_at falls back to the received time: pick one in the window.
        val inAt = ke.hesabu.app.parse.pack.Normalisers.isoToEpochMillis("2026-10-12T18:04:00+03:00")
        val r2 = pipeline.ingest(InboundMessage("TESTPAY", "You have received KES 1000 from your bank", inAt))
        assertEquals(1, r2.transfersPaired)
        val rows = db.transactionDao().between(0, Long.MAX_VALUE)
        assertEquals(2, rows.size)
        assertTrue(rows.all { it.isTransfer })
        assertEquals(1, rows.map { it.transferPairId }.distinct().size)
        assertNotNull(rows[0].transferPairId)
        // Both rows went back on the sync queue (the first was updated).
        assertEquals(2, db.syncQueueDao().count())
    }

    @Test
    fun withdrawalsAreNeverPaired() = runTest {
        pipeline.ingest(sms("QJK3X8Y2M5 Confirmed.on 12/10/26 at 5:30 PMWithdraw Ksh2,000.00 from 123456 - KAMAU AGENCIES NAIROBI New M-PESA balance is Ksh1,650.00. Transaction cost, Ksh29.00."))
        val inAt = ke.hesabu.app.parse.pack.Normalisers.isoToEpochMillis("2026-10-12T17:31:00+03:00")
        val r = pipeline.ingest(InboundMessage("TESTPAY", "You have received KES 2000 from your bank", inAt))
        assertEquals(0, r.transfersPaired)
        val w = db.transactionDao().between(0, Long.MAX_VALUE).first { it.type == "WITHDRAW" }
        assertFalse(w.isTransfer)
        assertEquals("cash", w.categoryId)
    }

    @Test
    fun balanceBreakIsFlaggedNotCorrected() = runTest {
        // 2:45 PM: balance 3,450 after sending 1,200 + 23 fee, so the previous balance was 4,673.
        // 1:20 PM: Naivas 450 leaves 4,673: consistent. Then a 3:00 PM message that does not add up.
        pipeline.ingest(listOf(sms(buyGoods), sms(send)))
        val odd = "QJK3X8Y2M9 Confirmed. Ksh100.00 paid to KIOSK. on 12/10/26 at 3:00 PM.New M-PESA balance is Ksh1,000.00. Transaction cost, Ksh0.00."
        val r = pipeline.ingest(sms(odd))
        assertEquals(1, r.balanceBreaks)
        val rows = db.transactionDao().between(0, Long.MAX_VALUE).sortedBy { it.occurredAtMillis }
        assertEquals(listOf(false, false, true), rows.map { it.balanceBreak })
        assertEquals(10_000L, rows.last().amountCents) // untouched
    }

    @Test
    fun unknownBodiesArePurgedAfterThirtyDays() = runTest {
        val old = clock - 31L * 24 * 3600 * 1000
        pipeline.ingest(listOf(sms("Old mystery from M-PESA", at = old), sms("New mystery from M-PESA", at = clock)))
        assertEquals(2, db.unknownMessageDao().pendingCount())
        assertEquals(1, db.unknownMessageDao().purgeOlderThan(clock - ReconcileWorker.UNKNOWN_RETENTION_MS))
        assertEquals(1, db.unknownMessageDao().pendingCount())
    }

    @Test
    fun unknownBodiesAreStoredEncryptedAndDeduped() = runTest {
        val body = "Something new from M-PESA that no family knows about yet"
        pipeline.ingest(listOf(sms(body), sms(body)))
        pipeline.ingest(sms(body))
        assertEquals(1, db.unknownMessageDao().pendingCount())
        val row = db.unknownMessageDao().observePending().first().single()
        assertFalse(String(row.bodyEncrypted, Charsets.UTF_8) == body)
        assertEquals(body, cipher.decrypt(row.bodyEncrypted))
        assertEquals("mpesa_builtin", row.packIds)
    }
}
