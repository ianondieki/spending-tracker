package ke.hesabu.app.sync

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.ReportSummary
import kotlinx.serialization.json.JsonElement

/**
 * HTTP client for the Hesabu API (contracts/openapi.yaml). Single-user device-token auth for the sprint.
 * Fails closed: without a base URL nothing is ever sent; without a token only registration is allowed.
 */
class SyncClient(
    private val baseUrl: String,
    private val tokenProvider: () -> String?,
    engine: HttpClientEngine? = null,
    /** Whether the user has turned on "allow http for local testing". Loopback hosts never need it. */
    private val cleartextAllowed: () -> Boolean = { false },
) {
    open class NotConfigured(message: String = "sync is not configured") : IllegalStateException(message)

    /** An `http://` server address while the cleartext toggle is off: nothing is sent. */
    class CleartextBlocked : NotConfigured("http server address needs the local-testing toggle")
    class Unauthorised : IllegalStateException("device token rejected")
    class ServerError(val status: Int, val code: String, override val message: String) : RuntimeException("$status $code: $message") {
        /** 5xx and 429 are worth a retry; 4xx (except 401/429) are not. */
        val retryable: Boolean get() = status >= 500 || status == 429
    }

    private val client = (if (engine != null) HttpClient(engine) { configure() } else HttpClient(OkHttp) { configure() })

    private fun io.ktor.client.HttpClientConfig<*>.configure() {
        expectSuccess = false
        // A redirect could carry the bearer token to another host.
        followRedirects = false
        install(ContentNegotiation) { json(WireJson) }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 60_000
            socketTimeoutMillis = 60_000
        }
    }

    private fun base(): String {
        if (!(baseUrl.startsWith("http://") || baseUrl.startsWith("https://"))) throw NotConfigured()
        if (baseUrl.startsWith("http://") && !isLoopback(baseUrl) && !cleartextAllowed()) throw CleartextBlocked()
        return baseUrl.trimEnd('/')
    }

    private fun auth(): String = tokenProvider() ?: throw Unauthorised()

    private suspend inline fun <reified T> HttpResponse.bodyOrThrow(): T {
        if (status == HttpStatusCode.Unauthorized || status == HttpStatusCode.Forbidden) throw Unauthorised()
        if (status.value >= 400) {
            val err = runCatching { WireJson.decodeFromString(ApiError.serializer(), bodyAsText()) }.getOrDefault(ApiError())
            throw ServerError(status.value, err.code, err.message.ifEmpty { status.description })
        }
        return body()
    }

    /** Liveness check; true when the server answers 2xx. */
    suspend fun ping(): Boolean = runCatching { client.get("${base()}/health").status.isSuccess() }.getOrDefault(false)

    suspend fun register(deviceId: String, appVersion: String, displayName: String? = null): RegisterResponse =
        client.post("${base()}/v1/devices/register") {
            contentType(ContentType.Application.Json)
            setBody(RegisterRequest(deviceId = deviceId, appVersion = appVersion, displayName = displayName))
        }.bodyOrThrow()

    suspend fun sync(request: SyncRequest): SyncResponse {
        require(request.transactions.size <= 500) { "a sync batch holds at most 500 transactions" }
        return client.post("${base()}/v1/sync") {
            header(HttpHeaders.Authorization, "Bearer ${auth()}")
            contentType(ContentType.Application.Json)
            setBody(request)
        }.bodyOrThrow()
    }

    suspend fun getPreferences(): WirePreferences =
        client.get("${base()}/v1/me/preferences") { header(HttpHeaders.Authorization, "Bearer ${auth()}") }.bodyOrThrow()

    /** PUT preferences; a 409 `address_taken` (another user verified that WhatsApp number) surfaces as [ServerError]. */
    suspend fun putPreferences(p: WirePreferences): WirePreferences =
        client.put("${base()}/v1/me/preferences") {
            header(HttpHeaders.Authorization, "Bearer ${auth()}")
            contentType(ContentType.Application.Json)
            setBody(p.forPut())
        }.bodyOrThrow()

    /** Asks the server to email a magic link to the address in preferences. 202 on success; 429 when rate limited. */
    suspend fun sendEmailLink() {
        val response = client.post("${base()}/v1/me/email/send-link") { header(HttpHeaders.Authorization, "Bearer ${auth()}") }
        if (response.status == HttpStatusCode.Unauthorized || response.status == HttpStatusCode.Forbidden) throw Unauthorised()
        if (response.status.value >= 400) {
            val err = runCatching { WireJson.decodeFromString(ApiError.serializer(), response.bodyAsText()) }.getOrDefault(ApiError())
            throw ServerError(response.status.value, err.code.ifEmpty { if (response.status.value == 429) "rate_limited" else "" }, err.message.ifEmpty { response.status.description })
        }
    }

    suspend fun reports(kind: String? = null): List<ReportSummary> =
        client.get("${base()}/v1/reports" + (kind?.let { "?kind=$it" } ?: "")) { header(HttpHeaders.Authorization, "Bearer ${auth()}") }.bodyOrThrow()

    suspend fun report(reportId: String): ReportDetail =
        client.get("${base()}/v1/reports/$reportId") { header(HttpHeaders.Authorization, "Bearer ${auth()}") }.bodyOrThrow()

    suspend fun generateReport(kind: String, period: String, deliver: Boolean = false): ReportSummary =
        client.post("${base()}/v1/reports/generate") {
            header(HttpHeaders.Authorization, "Bearer ${auth()}")
            contentType(ContentType.Application.Json)
            setBody(GenerateRequest(kind = kind, period = period, deliver = deliver))
        }.bodyOrThrow()

    suspend fun rawGet(path: String): JsonElement =
        client.get("${base()}$path") { header(HttpHeaders.Authorization, "Bearer ${auth()}") }.bodyOrThrow()

    fun close() = client.close()

    private fun HttpStatusCode.isSuccess() = value in 200..299

    companion object {
        /** The emulator's host alias and the device itself: cleartext here never leaves the machine. */
        fun isLoopback(url: String): Boolean {
            val host = runCatching { java.net.URI(url).host }.getOrNull()?.lowercase() ?: return false
            return host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "::1"
        }
    }
}
