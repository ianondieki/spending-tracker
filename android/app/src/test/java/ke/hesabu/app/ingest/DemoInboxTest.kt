package ke.hesabu.app.ingest

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.InsecureTestBodyCipher
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.TestPacks
import ke.hesabu.app.sync.WireMapper
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** The built-in demo inbox parses end to end through the real engine and can be removed again. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DemoInboxTest {

    private lateinit var db: HesabuDatabase
    private lateinit var pipeline: IngestPipeline

    @Before
    fun setUp() {
        db = HesabuDatabase.inMemory(ApplicationProvider.getApplicationContext<Context>())
        pipeline = IngestPipeline(db, PackEngine(TestPacks.builtinPacks()), InsecureTestBodyCipher())
    }

    @After
    fun tearDown() = db.close()

    private fun demoText() = TestPacks.moduleDir.resolve("src/main/assets/demo-builtin/demo-inbox.jsonl").readText()

    @Test
    fun tolerantParserReadsSeveralShapes() {
        val rows = DemoInbox.parse(
            """
            {"sender":"MPESA","body":"a","received_at":"2026-10-12T14:45:00+03:00"}
            {"address":"MPESA","text":"b","date":1760000000000}
            {"from":"MPESA","message":"c","at":1760000000}
            not json
            """.trimIndent(),
        )
        assertEquals(3, rows.size)
        assertEquals(1_760_000_000_000L, rows[1].receivedAtMillis)
        assertEquals(1_760_000_000_000L, rows[2].receivedAtMillis)
    }

    @Test
    fun builtinDemoInboxParsesAlmostEntirelyAndIsRemovable() = runTest {
        val messages = DemoInbox.parse(demoText())
        assertTrue(messages.size >= 25)
        val report = pipeline.ingest(messages, tags = listOf(DemoInbox.TAG))
        assertTrue("parsed ${report.parsed} of ${messages.size}", report.parsed >= messages.size - 3)
        assertEquals(1, report.ignored) // the balance enquiry
        assertEquals(0, report.balanceBreaks) // the demo chain is consistent
        val rows = db.transactionDao().between(0, Long.MAX_VALUE)
        assertTrue(rows.all { WireMapper.parseTags(it.tags) == listOf("demo") })
        assertEquals(rows.size, db.transactionDao().idsByTag("\"demo\"").size)
        assertEquals(rows.size, db.transactionDao().deleteByTag("\"demo\""))
        assertEquals(0, db.transactionDao().count())
    }
}
