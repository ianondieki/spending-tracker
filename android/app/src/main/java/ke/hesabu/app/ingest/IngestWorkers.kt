package ke.hesabu.app.ingest

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.data.SettingsKeys
import ke.hesabu.app.sync.SyncScheduler
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/** Progress keys shared by the backfill worker and the onboarding screen. */
object BackfillProgress {
    const val TOTAL = "total"
    const val DONE = "done"
    const val PARSED = "parsed"
    const val UNKNOWN = "unknown"
    const val DUPLICATES = "duplicates"
    /** "sender=count,sender=count" of new ledger rows, lower-cased senders. */
    const val PER_SENDER = "per_sender"

    fun perSender(data: Data): Map<String, Int> =
        data.getString(PER_SENDER)?.split(',')?.filter { it.contains('=') }?.associate { kv -> kv.substringBefore('=') to (kv.substringAfter('=').toIntOrNull() ?: 0) } ?: emptyMap()
}

/**
 * Reads the inbox back [months] months (default 12) in pages and runs each page through the pipeline, reporting
 * progress with per-sender counts. Idempotent: the pipeline dedupes, so re-running is safe.
 */
/** Shared body of the backfill and reconciliation workers. */
object InboxScan {
    data class Outcome(val total: Int, val done: Int, val report: IngestPipeline.Report, val stopped: Boolean)

    /** Reads matching inbox rows since [sinceMillis] page by page through the pipeline. */
    suspend fun run(context: Context, sinceMillis: Long, isStopped: () -> Boolean, onProgress: suspend (Data) -> Unit): Outcome {
        val graph = HesabuApplication.graph(context)
        graph.ensureTaxonomy()
        val reader = InboxReader(context)
        val senders = graph.engine.knownSenders
        val total = reader.count(senders, sinceMillis)
        var done = 0
        var report = IngestPipeline.Report()
        onProgress(progress(total, done, report))
        var after = -1L
        while (!isStopped()) {
            val page = reader.page(senders, sinceMillis, after)
            if (page.messages.isEmpty() || page.lastId == null) break
            report += graph.pipeline.ingest(page.messages)
            done += page.messages.size
            after = page.lastId
            onProgress(progress(total, done, report))
        }
        return Outcome(total, done, report, isStopped())
    }

    fun progress(total: Int, done: Int, r: IngestPipeline.Report): Data = workDataOf(
        BackfillProgress.TOTAL to total,
        BackfillProgress.DONE to done,
        BackfillProgress.PARSED to r.parsed,
        BackfillProgress.UNKNOWN to r.unknown,
        BackfillProgress.DUPLICATES to r.duplicates,
        BackfillProgress.PER_SENDER to r.perSender.entries.joinToString(",") { "${it.key}=${it.value}" },
    )

    fun hasReadSms(context: Context) =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
}

/**
 * Reads the inbox back [KEY_MONTHS] months (default 12) in pages and runs each page through the pipeline, reporting
 * progress with per-sender counts. Idempotent: the pipeline dedupes, so re-running is safe.
 */
class BackfillWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!InboxScan.hasReadSms(ctx)) return Result.failure(workDataOf("reason" to "no_permission"))
        val graph = HesabuApplication.graph(ctx)
        val settings = graph.currentSettings()
        val months = inputData.getInt(KEY_MONTHS, settings.backfillMonths)
        val since = ZonedDateTime.now(java.time.ZoneId.of(settings.timeZone)).minusMonths(months.toLong()).toInstant().toEpochMilli()
        val out = InboxScan.run(ctx, since, { isStopped }) { setProgress(it) }
        if (out.stopped) return Result.retry()
        graph.settings.set(SettingsKeys.LastBackfillAt, System.currentTimeMillis())
        if (out.report.parsed > 0) SyncScheduler.requestSoon(ctx)
        return Result.success(InboxScan.progress(out.total, out.done, out.report))
    }

    companion object {
        const val UNIQUE_NAME = "hesabu-backfill"
        const val RECONCILE_NAME = "hesabu-reconcile"
        const val KEY_MONTHS = "months"

        /** The one-off first-run backfill; replaces any running one. */
        fun start(context: Context, months: Int) {
            val req = OneTimeWorkRequestBuilder<BackfillWorker>()
                .setInputData(workDataOf(KEY_MONTHS to months))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, req)
        }

        /**
         * Reconciliation every six hours: re-scan the last 14 days for anything the receiver missed (receivers get
         * killed on Tecno, Infinix and Xiaomi). The pipeline's dedupe makes this a no-op when nothing was missed.
         */
        fun schedulePeriodicReconcile(context: Context) {
            val req = PeriodicWorkRequestBuilder<ReconcileWorker>(6, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(RECONCILE_NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancelAll(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_NAME)
            WorkManager.getInstance(context).cancelUniqueWork(RECONCILE_NAME)
        }
    }
}

/** The periodic re-scan: the last 14 days through the same pipeline. */
class ReconcileWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!InboxScan.hasReadSms(ctx)) return Result.failure()
        val since = System.currentTimeMillis() - 14L * 24 * 3600 * 1000
        val out = InboxScan.run(ctx, since, { isStopped }) { setProgress(it) }
        if (out.stopped) return Result.retry()
        val graph = HesabuApplication.graph(ctx)
        graph.settings.set(SettingsKeys.LastReconcileAt, System.currentTimeMillis())
        if (out.report.parsed > 0) SyncScheduler.requestSoon(ctx)
        return Result.success(InboxScan.progress(out.total, out.done, out.report))
    }
}
