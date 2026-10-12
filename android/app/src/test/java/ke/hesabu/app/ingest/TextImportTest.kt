package ke.hesabu.app.ingest

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.InsecureTestBodyCipher
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.TestPacks
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Shared or pasted text has no sender: the pack that parses a block names it; the rest go to Teach Hesabu. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TextImportTest {

    private lateinit var db: HesabuDatabase
    private lateinit var engine: PackEngine
    private lateinit var importer: TextImport

    @Before
    fun setUp() {
        db = HesabuDatabase.inMemory(ApplicationProvider.getApplicationContext<Context>())
        engine = PackEngine(TestPacks.builtinPacks())
        importer = TextImport(engine, IngestPipeline(db, engine, InsecureTestBodyCipher()))
    }

    @After
    fun tearDown() = db.close()

    private val send = "QJK3X8Y2M1 Confirmed. Ksh1,200.00 sent to JANE WANJIKU 0712 345678 on 12/10/26 at 2:45 PM. New M-PESA balance is Ksh3,450.00. Transaction cost, Ksh23.00."
    private val buy = "QJK3X8Y2M4 Confirmed. Ksh450.00 paid to NAIVAS SUPERMARKET. on 12/10/26 at 1:20 PM.New M-PESA balance is Ksh3,650.00. Transaction cost, Ksh0.00."

    @Test
    fun senderIsInferredFromThePackThatParses() {
        assertEquals("MPESA", engine.senderFor(send))
        assertNull(engine.senderFor("See you at 6"))
    }

    @Test
    fun splitsBlankLineBlocksOrOneMessagePerLine() {
        assertEquals(2, importer.split("$send\n\n$buy").size)
        assertEquals(2, importer.split("$send\n$buy").size)
        assertEquals(1, importer.split("one line\nanother line").size)
    }

    @Test
    fun importsParsedBlocksAndKeepsTheRestAsUnknown() = runTest {
        val (report, skipped) = importer.import("$send\n\nSome unrelated note\n\n$buy", 0, MessageSource.Share)
        assertEquals(2, report.parsed)
        assertEquals(1, skipped)
        assertEquals(1, report.unknown)
        assertEquals(2, db.transactionDao().count())
        assertEquals(1, db.unknownMessageDao().pendingCount())
        assertEquals("share", db.transactionDao().between(0, Long.MAX_VALUE).first().source)
        // Importing the same text again adds nothing.
        val (again, _) = importer.import("$send\n\n$buy", 0, MessageSource.Import)
        assertEquals(0, again.parsed)
        assertEquals(2, again.duplicates)
    }
}
