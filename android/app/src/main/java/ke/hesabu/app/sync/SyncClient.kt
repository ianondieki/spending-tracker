package ke.hesabu.app.sync

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * HTTP client for the Hesabu API (contracts/openapi.yaml is authoritative).
 * Single-user device-token auth for the sprint. Only derived ledger rows are ever sent;
 * raw message text never leaves the phone.
 */
class SyncClient(
    private val baseUrl: String,
    private val deviceToken: String,
) {
    private val client = HttpClient(OkHttp) {
        expectSuccess = false
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                },
            )
        }
        defaultRequest {
            header(HttpHeaders.Authorization, "Bearer $deviceToken")
        }
    }

    /** Liveness check against the API; true when the server answers 2xx. */
    suspend fun ping(): Boolean = client.get("$baseUrl/health").status.isSuccess()

    fun close() = client.close()
}
