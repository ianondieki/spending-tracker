package ke.hesabu.app.ingest

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.MainActivity
import ke.hesabu.app.R
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.sync.SyncScheduler
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.settings.ImportPreviewSheet
import ke.hesabu.app.ui.theme.HesabuTheme
import kotlinx.coroutines.launch

/**
 * Share-to-app: text shared from the SMS app (or any app) is parsed first and shown as counts per message type;
 * nothing is written to the ledger or queued for sync until the user confirms. Shared text is untrusted, and any
 * app on the device can send it, so the confirm tap is the only thing that turns it into money rows.
 */
class ShareReceiverActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = if (intent?.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null
        if (text.isNullOrBlank() || text.length > MAX_SHARED_CHARS) {
            finish()
            return
        }
        val graph = HesabuApplication.graph(this)
        val importer = TextImport(graph.engine, graph.pipeline)
        val preview = importer.preview(text)
        setContent {
            var busy by remember { mutableStateOf(false) }
            HesabuTheme {
                HesabuScreen(title = getString(R.string.share_target_label), onBack = { finish() }) {
                    ImportPreviewSheet(
                        preview = preview,
                        busy = busy,
                        onCancel = { finish() },
                        onConfirm = {
                            busy = true
                            lifecycleScope.launch {
                                graph.ensureTaxonomy()
                                val (report, _) = importer.import(text, System.currentTimeMillis(), MessageSource.Share)
                                if (report.parsed > 0) SyncScheduler.requestSoon(this@ShareReceiverActivity)
                                val msg = when {
                                    report.parsed > 0 -> resources.getQuantityString(R.plurals.import_result_parsed, report.parsed, report.parsed)
                                    report.duplicates > 0 && report.unknown == 0 -> getString(R.string.import_result_duplicate)
                                    report.unknown > 0 -> resources.getQuantityString(R.plurals.import_result_unknown, report.unknown, report.unknown)
                                    else -> getString(R.string.import_result_nothing)
                                }
                                Toast.makeText(this@ShareReceiverActivity, msg, Toast.LENGTH_LONG).show()
                                startActivity(Intent(this@ShareReceiverActivity, MainActivity::class.java).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                                    putExtra(MainActivity.EXTRA_OPEN, "transactions")
                                })
                                finish()
                            }
                        },
                    )
                }
            }
        }
    }

    private companion object {
        /** More than a few concatenated messages is not something a person shares by hand. */
        const val MAX_SHARED_CHARS = 20_000
    }
}
