package ke.hesabu.app.sync

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.content.TextContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import ke.hesabu.app.AppGraph
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.InMemorySecretStore
import ke.hesabu.app.data.InsecureTestBodyCipher
import ke.hesabu.app.data.SettingsKeys
import ke.hesabu.app.parse.pack.InboundMessage
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The sync protocol against a fake server: registration, batches of 500, marking synced, rejections, auth loss. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SyncerTest {

    private lateinit var graph: AppGraph
    private val requests = ArrayList<HttpRequestData>()
    private val bodies = ArrayList<String>()
    private var failSync: HttpStatusCode? = null
    private var rejectFirst = false

    @Before
    fun setUp() = runTest {
        val context = ApplicationProvider.getApplicationContext<Context>()
        graph = AppGraph(context, dbFactory = { HesabuDatabase.inMemory(it) }, cipherFactory = { InsecureTestBodyCipher() }, secretsFactory = { InMemorySecretStore() })
        graph.settings.set(SettingsKeys.ServerUrl, "http://test.local")
        graph.secrets.deviceToken = null
    }

    private fun engine() = MockEngine { req ->
        requests.add(req)
        val body = (req.body as? TextContent)?.text ?: ""
        bodies.add(body)
        when (req.url.encodedPath) {
            "/v1/devices/register" -> respond("""{"device_token":"tok-1","user_id":"u1"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            "/v1/sync" -> {
                if (req.headers[HttpHeaders.Authorization] != "Bearer tok-1") respond("""{"code":"unauthorised","message":"no"}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json"))
                else failSync?.let { respond("""{"code":"err","message":"boom"}""", it, headersOf(HttpHeaders.ContentType, "application/json")) } ?: run {
                    val txs = Json.parseToJsonElement(body).jsonObject["transactions"]!!.jsonArray
                    val rejected = if (rejectFirst) """[{"id":"${txs.first().jsonObject["id"]!!.jsonPrimitive.content}","reason":"bad"}]""" else "[]"
                    rejectFirst = false
                    respond("""{"accepted":${txs.size},"rejected":$rejected,"server_time":"2026-10-12T12:00:00+03:00","next_report_at":"2026-10-18T19:30:00+03:00"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
            }
            else -> respond("not found", HttpStatusCode.NotFound)
        }
    }

    private fun syncer() = Syncer(graph) { url -> SyncClient(url, { graph.secrets.deviceToken }, engine()) }

    private suspend fun seed(n: Int) {
        val msgs = (1..n).map { i ->
            val code = "QJK3X8%04d".format(i)
            InboundMessage("MPESA", "$code Confirmed. Ksh${100 + i}.00 paid to SHOP $i. on 12/10/26 at 1:20 PM.New M-PESA balance is Ksh3,650.00. Transaction cost, Ksh0.00.", 1_760_000_000_000L + i)
        }
        graph.pipeline.ingest(msgs)
    }

    @Test
    fun registersThenUploadsInBatchesOf500AndMarksSynced() = runTest {
        seed(620)
        assertEquals(620, graph.db.syncQueueDao().count())
        val out = syncer().syncOnce()
        assertEquals(Syncer.Outcome.Done(620, 0), out)
        assertEquals("/v1/devices/register", requests[0].url.encodedPath)
        val syncs = requests.filter { it.url.encodedPath == "/v1/sync" }
        assertEquals(2, syncs.size)
        val sizes = bodies.drop(1).map { Json.parseToJsonElement(it).jsonObject["transactions"]!!.jsonArray.size }
        assertEquals(listOf(500, 120), sizes)
        assertEquals(0, graph.db.syncQueueDao().count())
        assertTrue(graph.db.transactionDao().between(0, Long.MAX_VALUE).all { it.syncedAtMillis != null })
        assertEquals("2026-10-18T19:30:00+03:00", graph.currentSettings().nextReportAt)
        assertEquals("tok-1", graph.secrets.deviceToken)
        // No message body anywhere on the wire.
        assertFalse(bodies.any { it.contains("paid to SHOP") })
        val first = Json.parseToJsonElement(bodies[1]).jsonObject
        assertEquals("sms", first["transactions"]!!.jsonArray[0].jsonObject["source"]!!.jsonPrimitive.content)
        assertTrue(first["accounts"]!!.jsonArray.isNotEmpty())
    }

    @Test
    fun rejectedRowsStayQueuedWithTheReason() = runTest {
        seed(3)
        rejectFirst = true
        val out = syncer().syncOnce()
        assertEquals(Syncer.Outcome.Done(2, 1), out)
        assertEquals(1, graph.db.syncQueueDao().count())
        assertEquals("rejected", graph.db.syncQueueDao().nextBatch(1).single().lastError)
    }

    @Test
    fun serverErrorsRetryAndClientErrorsFail() = runTest {
        seed(1)
        failSync = HttpStatusCode.ServiceUnavailable
        assertEquals(Syncer.Outcome.Retry("server 503"), syncer().syncOnce())
        assertEquals(1, graph.db.syncQueueDao().count())
        failSync = HttpStatusCode.BadRequest
        assertEquals(Syncer.Outcome.Failed("server 400"), syncer().syncOnce())
        assertEquals("server 400", graph.currentSettings().lastSyncError)
    }

    @Test
    fun lostTokenIsDroppedForReRegistration() = runTest {
        seed(1)
        graph.secrets.deviceToken = "stale"
        assertEquals(Syncer.Outcome.Retry("unauthorised"), syncer().syncOnce())
        assertNull(graph.secrets.deviceToken)
        assertEquals(Syncer.Outcome.Done(1, 0), syncer().syncOnce())
    }

    @Test
    fun nothingIsSentWithoutAServerAddress() = runTest {
        graph.settings.set(SettingsKeys.ServerUrl, "")
        seed(1)
        assertEquals(Syncer.Outcome.NotConfigured, syncer().syncOnce())
        assertTrue(requests.isEmpty())
    }
}
