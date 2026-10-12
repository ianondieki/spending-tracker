package ke.hesabu.app.ingest

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.MainActivity
import ke.hesabu.app.R
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.sync.SyncScheduler
import kotlinx.coroutines.launch

/**
 * Share-to-app: the user shares a money message (or several) from the SMS app to Hesabu. The text runs through
 * the same pipeline as live SMS, then the app opens on Transactions. No permission is needed for this path.
 */
class ShareReceiverActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = if (intent?.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null
        if (text.isNullOrBlank()) {
            finish()
            return
        }
        val graph = HesabuApplication.graph(this)
        lifecycleScope.launch {
            graph.ensureTaxonomy()
            val (report, _) = TextImport(graph.engine, graph.pipeline).import(text, System.currentTimeMillis(), MessageSource.Share)
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
    }
}
