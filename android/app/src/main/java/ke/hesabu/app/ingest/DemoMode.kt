package ke.hesabu.app.ingest

import android.content.Context
import ke.hesabu.app.AppGraph
import ke.hesabu.app.data.SettingsKeys

/** Turns demo mode on (feed the demo inbox through the pipeline) or off (remove exactly those rows). */
class DemoMode(private val context: Context, private val graph: AppGraph) {

    suspend fun enable(): IngestPipeline.Report {
        graph.ensureTaxonomy()
        val messages = DemoInbox.load(context)
        val report = graph.pipeline.ingest(messages, tags = listOf(DemoInbox.TAG))
        graph.settings.set(SettingsKeys.DemoMode, true)
        return report
    }

    suspend fun disable(): Int {
        val quoted = "\"${DemoInbox.TAG}\""
        val ids = graph.db.transactionDao().idsByTag(quoted)
        if (ids.isNotEmpty()) ids.chunked(500).forEach { graph.db.syncQueueDao().remove(it) }
        val removed = graph.db.transactionDao().deleteByTag(quoted)
        graph.db.unknownMessageDao().deleteBySource("import")
        graph.settings.set(SettingsKeys.DemoMode, false)
        return removed
    }
}
