package ke.hesabu.app.ui.reports

import android.content.ClipData
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.data.AppSettings
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** What can be shared from a report: the WhatsApp hero image or the PDF. */
enum class ShareKind(val mime: String, val suffix: String) {
    Image("image/png", "hero.png"),
    Pdf("application/pdf", "report.pdf"),
}

/** A downloaded artefact, ready for the share sheet. */
data class ShareFile(val file: File, val kind: ShareKind)

/**
 * Downloads a report's hero PNG or PDF into the app cache (`cache/reports/`, the only directory the FileProvider
 * exposes) so it can go through the Android share sheet. Fails closed: only http(s) URLs are fetched, the device
 * token is sent only to the configured server's own host, and files over [MAX_BYTES] are refused. Nothing is logged.
 */
class ReportArtefactDownloader(
    private val cacheDir: File,
    private val settings: suspend () -> AppSettings,
    private val token: () -> String?,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun download(reportId: String, url: String, kind: ShareKind): ShareFile = withContext(io) {
        val s = settings()
        val target = resolve(url, s.serverUrl) ?: throw IOException("unusable artefact address")
        val dir = File(cacheDir, DIR).apply { mkdirs() }
        val file = File(dir, "${safeName(reportId)}-${kind.suffix}")
        val partial = File(dir, file.name + ".part")
        val bearer = if (sameHost(target, s.serverUrl)) token() else null
        val connection = (target.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 60_000
            // A redirect could carry the token to another host, so a request that sends it does not follow one.
            instanceFollowRedirects = bearer == null
            if (bearer != null) setRequestProperty("Authorization", "Bearer $bearer")
        }
        try {
            if (connection.responseCode !in 200..299) throw IOException("artefact download refused")
            if (connection.contentLengthLong > MAX_BYTES) throw IOException("artefact too large")
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(16 * 1024)
                    var total = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > MAX_BYTES) throw IOException("artefact too large")
                        output.write(buffer, 0, read)
                    }
                }
            }
            if (!partial.renameTo(file)) {
                partial.copyTo(file, overwrite = true)
                partial.delete()
            }
            ShareFile(file, kind)
        } finally {
            partial.delete()
            connection.disconnect()
        }
    }

    companion object {
        const val DIR = "reports"
        const val MAX_BYTES = 15L * 1024 * 1024

        fun create(context: Context): ReportArtefactDownloader {
            val app = context.applicationContext
            val graph = HesabuApplication.graph(app)
            return ReportArtefactDownloader(app.cacheDir, { graph.currentSettings() }, { graph.secrets.deviceToken })
        }

        /** An absolute http(s) URL, or a server-relative path resolved against the configured server. */
        internal fun resolve(url: String, serverUrl: String): URL? = runCatching {
            val u = URI(url.trim())
            val absolute = when {
                u.isAbsolute -> u
                serverUrl.startsWith("http://") || serverUrl.startsWith("https://") -> URI(serverUrl.trimEnd('/') + "/").resolve(u)
                else -> return@runCatching null
            }
            if (absolute.scheme != "https" && absolute.scheme != "http") null else absolute.toURL()
        }.getOrNull()

        internal fun sameHost(target: URL, serverUrl: String): Boolean = runCatching {
            val server = URI(serverUrl).toURL()
            server.host.equals(target.host, ignoreCase = true) && server.protocol == target.protocol && server.port == target.port
        }.getOrDefault(false)

        internal fun safeName(id: String): String = id.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80).ifEmpty { "report" }
    }
}

/** Builds the share-sheet intent for a downloaded file through the app's FileProvider. */
object ReportShareIntent {
    fun authority(context: Context): String = "${context.packageName}.fileprovider"

    fun chooser(context: Context, shared: ShareFile, title: String): Intent {
        val uri = FileProvider.getUriForFile(context, authority(context), shared.file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = shared.kind.mime
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(null, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(send, title).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}
