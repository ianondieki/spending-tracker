package ke.hesabu.app.sync

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.content.TextContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/** Request bodies match contracts/openapi.yaml and transaction.schema.json: types, required keys, no extras. */
class SyncClientBodyTest {

    private val sent = ArrayList<Pair<String, String>>()

    private fun client(cleartext: Boolean = false, url: String = "https://api.test") = SyncClient(url, { "tok" }, MockEngine { req ->
        sent.add(req.url.encodedPath to ((req.body as? TextContent)?.text ?: ""))
        when (req.url.encodedPath) {
            "/v1/reports/generate" -> respond("""{"report_id":"r1","kind":"weekly","period_start":"2026-10-05T00:00:00+03:00","period_end":"2026-10-12T00:00:00+03:00","status":"queued"}""", HttpStatusCode.Accepted, headersOf(HttpHeaders.ContentType, "application/json"))
            "/v1/sync" -> respond("""{"accepted":1,"rejected":[],"server_time":"2026-10-12T12:00:00+03:00"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            else -> respond("{}", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
    }, cleartextAllowed = { cleartext })

    @Test
    fun generateSendsBooleansNotStrings() = runTest {
        client().generateReport("weekly", "last_week", deliver = false)
        val body = Json.parseToJsonElement(sent.single().second).jsonObject
        val deliver = body["deliver"] as JsonPrimitive
        assertFalse("deliver must be a JSON boolean, not a string", deliver.isString)
        assertEquals("false", deliver.content)
        assertEquals("weekly", body["kind"]!!.jsonPrimitive.content)
        assertEquals("last_week", body["period"]!!.jsonPrimitive.content)
        assertEquals(setOf("kind", "period", "deliver", "force"), body.keys)
    }

    @Test
    fun syncBodyMatchesTheTransactionSchema() = runTest {
        val schemaFile = System.getProperty("hesabu.contractsDir")?.let { File(it, "transaction.schema.json") }
        assumeTrue(schemaFile?.isFile == true)
        val defs = Json.parseToJsonElement(schemaFile!!.readText()).jsonObject["\$defs"]!!.jsonObject
        fun props(name: String) = defs[name]!!.jsonObject["properties"]!!.jsonObject.keys
        fun required(name: String) = defs[name]!!.jsonObject["required"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet()

        val entity = ke.hesabu.app.ui.SampleData.tx
        val request = SyncRequest(
            deviceId = "d", appVersion = "0.1", parserVersion = "mpesa@0.2.0",
            accounts = listOf(WireMapper.account(ke.hesabu.app.ui.SampleData.account)),
            transactions = listOf(WireMapper.transaction(entity)),
            unknownMessageCount = 0, sentAt = "2026-10-12T12:00:00+03:00",
        )
        client().sync(request)
        val body = Json.parseToJsonElement(sent.single().second).jsonObject
        assertTrue(body.keys.containsAll(required("SyncRequest")))
        assertTrue("extra keys ${body.keys - props("SyncRequest")}", (body.keys - props("SyncRequest")).isEmpty())
        val tx = body["transactions"]!!.jsonArray.single().jsonObject
        assertTrue("missing ${required("Transaction") - tx.keys}", tx.keys.containsAll(required("Transaction")))
        assertTrue("extra keys ${tx.keys - props("Transaction")}", (tx.keys - props("Transaction")).isEmpty())
        val cp = tx["counterparty"]!!.jsonObject
        assertTrue((cp.keys - props("Counterparty")).isEmpty())
        val acct = body["accounts"]!!.jsonArray.single().jsonObject
        assertTrue((acct.keys - props("Account")).isEmpty())
        assertTrue(acct.keys.containsAll(required("Account")))
    }

    @Test
    fun httpIsRefusedUnlessTheLocalTestingToggleIsOnOrTheHostIsLoopback() = runTest {
        try { client(url = "http://tunnel.example").generateReport("weekly", "last_week"); fail("expected CleartextBlocked") } catch (e: SyncClient.CleartextBlocked) {}
        assertTrue(sent.isEmpty())
        client(cleartext = true, url = "http://tunnel.example").generateReport("weekly", "last_week")
        client(url = "http://10.0.2.2:8787").generateReport("weekly", "last_week")
        assertEquals(2, sent.size)
        assertTrue(SyncClient.isLoopback("http://localhost:8787"))
        assertFalse(SyncClient.isLoopback("http://10.0.0.5:8787"))
    }
}
