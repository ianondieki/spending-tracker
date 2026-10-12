package ke.hesabu.app.ui.reports

import android.content.Context
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.ReportJson
import ke.hesabu.app.reports.ReportSummary
import ke.hesabu.app.sync.SyncClient
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Where the Reports screens get their data. With a server configured (and demo mode off) it lists reports through
 * [SyncClient.reports] and opens them through [SyncClient.report], keeping what it fetched in memory for the life of
 * the process. Without a server, or in demo mode, it serves the bundled sample report from
 * `assets/demo-builtin/sample-report.json`, so the feature can be seen before anything is set up.
 *
 * Fails closed: nothing is requested unless the server address is a real http(s) URL, and the client itself refuses
 * to send without a device token. Errors propagate as the [SyncClient] exceptions (or I/O exceptions) for the
 * ViewModels to turn into designed states; nothing here logs.
 */
class ReportsRepository(
    private val settings: suspend () -> AppSettings,
    private val clientFactory: (String) -> SyncClient,
    private val sampleJson: () -> String?,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    /** Where a listing came from. */
    enum class Source { Server, Sample }

    data class Listing(
        val reports: List<ReportSummary>,
        val source: Source,
        val serverConfigured: Boolean,
        val demoMode: Boolean,
    )

    /** The outcome of asking for this week's report. */
    sealed interface Generated {
        data class Queued(val summary: ReportSummary) : Generated
        /** No server (or demo mode): reports are made on the server, so nothing was requested. */
        data object Offline : Generated
    }

    private val mutex = Mutex()
    private var listCache: Pair<String, List<ReportSummary>>? = null
    private val detailCache = mutableMapOf<String, Pair<String, ReportDetail>>()

    /** The bundled sample, parsed once; null if the asset is missing or malformed. */
    val sample: ReportDetail? by lazy {
        runCatching { sampleJson()?.let { ReportJson.decodeFromString(ReportDetail.serializer(), it) } }.getOrNull()
    }

    /** All reports, newest first. [refresh] skips the in-memory cache. */
    suspend fun list(refresh: Boolean = false): Listing = withContext(io) {
        val s = settings()
        if (useSample(s)) {
            return@withContext Listing(listOfNotNull(sample?.summary), Source.Sample, s.syncConfigured, s.demoMode)
        }
        val cached = mutex.withLock { listCache?.takeIf { !refresh && it.first == s.serverUrl }?.second }
        val reports = cached ?: withClient(s) { it.reports() }.sortedByDescending { it.periodStart }.also { fresh ->
            mutex.withLock { listCache = s.serverUrl to fresh }
        }
        Listing(reports, Source.Server, serverConfigured = true, demoMode = false)
    }

    /** One report with its document and facts. The sample id always resolves to the sample. */
    suspend fun report(reportId: String, refresh: Boolean = false): ReportDetail = withContext(io) {
        sample?.takeIf { it.summary.reportId == reportId }?.let { return@withContext it }
        val s = settings()
        if (useSample(s)) throw SyncClient.NotConfigured()
        val cached = mutex.withLock { detailCache[reportId]?.takeIf { !refresh && it.first == s.serverUrl }?.second }
        cached ?: withClient(s) { it.report(reportId) }.also { fresh ->
            // Only finished reports are worth keeping; one still being made is fetched again next time.
            if (fresh.document != null) mutex.withLock { detailCache[reportId] = s.serverUrl to fresh }
        }
    }

    /** Asks the server for this period's report ([kind] weekly or monthly); a no-op without a server. */
    suspend fun generate(kind: String = "weekly"): Generated = withContext(io) {
        val s = settings()
        if (useSample(s)) return@withContext Generated.Offline
        val summary = withClient(s) { it.generateReport(kind, "current") }
        mutex.withLock {
            val current = listCache?.takeIf { it.first == s.serverUrl }?.second.orEmpty()
            listCache = s.serverUrl to (listOf(summary) + current.filterNot { it.reportId == summary.reportId })
            detailCache.remove(summary.reportId)
        }
        Generated.Queued(summary)
    }

    private fun useSample(s: AppSettings): Boolean = s.demoMode || !s.syncConfigured

    private suspend fun <T> withClient(s: AppSettings, block: suspend (SyncClient) -> T): T {
        val client = clientFactory(s.serverUrl)
        try {
            return block(client)
        } finally {
            client.close()
        }
    }

    companion object {
        const val SAMPLE_ASSET = "demo-builtin/sample-report.json"

        @Volatile private var instance: ReportsRepository? = null

        /** The process-wide repository, so the cache outlives any one screen. */
        fun get(context: Context): ReportsRepository = instance ?: synchronized(this) {
            instance ?: run {
                val app = context.applicationContext
                val graph = HesabuApplication.graph(app)
                ReportsRepository(
                    settings = { graph.currentSettings() },
                    clientFactory = { url -> graph.syncClient(url) },
                    sampleJson = { readAsset(app, SAMPLE_ASSET) },
                ).also { instance = it }
            }
        }

        internal fun readAsset(context: Context, path: String): String? =
            runCatching { context.assets.open(path).bufferedReader().use { it.readText() } }.getOrNull()
    }
}
