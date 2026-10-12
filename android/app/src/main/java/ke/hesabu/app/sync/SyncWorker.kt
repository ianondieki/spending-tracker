package ke.hesabu.app.sync

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import ke.hesabu.app.AppGraph
import ke.hesabu.app.BuildConfig
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.data.SettingsKeys
import ke.hesabu.app.parse.pack.Normalisers
import java.util.concurrent.TimeUnit

/** The sync protocol, separated from WorkManager so it is unit-testable with a fake HTTP engine. */
class Syncer(private val graph: AppGraph, private val clientFactory: (String) -> SyncClient) {

    sealed interface Outcome {
        data class Done(val uploaded: Int, val rejected: Int) : Outcome
        data object NotConfigured : Outcome
        data object NothingToDo : Outcome
        data class Retry(val reason: String) : Outcome
        data class Failed(val reason: String) : Outcome
    }

    /** Registers if needed, then uploads queued rows in batches of [BATCH]. */
    suspend fun syncOnce(): Outcome {
        val settings = graph.currentSettings()
        if (!settings.syncConfigured) return Outcome.NotConfigured
        val client = clientFactory(settings.serverUrl)
        try {
            val deviceId = graph.settings.deviceId()
            if (graph.secrets.deviceToken == null) {
                val reg = client.register(deviceId, BuildConfig.VERSION_NAME)
                graph.secrets.deviceToken = reg.deviceToken
            }
            var uploaded = 0
            var rejected = 0
            var batches = 0
            val attempted = HashSet<String>()
            while (batches < MAX_BATCHES_PER_RUN) {
                // Rows rejected earlier in this run stay queued but are not re-sent until the next run.
                val queue = graph.db.syncQueueDao().nextBatch(BATCH + attempted.size).filter { it.transactionId !in attempted }.take(BATCH)
                if (queue.isEmpty()) break
                val ids = queue.map { it.transactionId }
                attempted.addAll(ids)
                val rows = graph.db.transactionDao().byIds(ids)
                val missing = ids - rows.map { it.id }.toSet()
                if (missing.isNotEmpty()) graph.db.syncQueueDao().remove(missing)
                if (rows.isEmpty()) continue
                val now = System.currentTimeMillis()
                val request = SyncRequest(
                    deviceId = deviceId,
                    appVersion = BuildConfig.VERSION_NAME,
                    parserVersion = graph.engine.packs.joinToString(";") { "${it.packId}@${it.version}" }.ifEmpty { "none" },
                    accounts = graph.db.accountDao().all().map(WireMapper::account),
                    transactions = rows.map(WireMapper::transaction),
                    unknownMessageCount = graph.db.unknownMessageDao().pendingCount(),
                    sentAt = Normalisers.epochMillisToIso(now),
                )
                val response = try {
                    client.sync(request)
                } catch (e: SyncClient.Unauthorised) {
                    // Token revoked or rotated: drop it and let the next run re-register.
                    graph.secrets.deviceToken = null
                    graph.db.syncQueueDao().recordFailure(ids, "unauthorised")
                    return Outcome.Retry("unauthorised")
                } catch (e: SyncClient.ServerError) {
                    graph.db.syncQueueDao().recordFailure(ids, "${e.status}")
                    graph.settings.set(SettingsKeys.LastSyncError, "server ${e.status}")
                    return if (e.retryable) Outcome.Retry("server ${e.status}") else Outcome.Failed("server ${e.status}")
                }
                val rejectedIds = response.rejected.map { it.id }.toSet()
                val acceptedIds = rows.map { it.id }.filter { it !in rejectedIds }
                graph.db.transactionDao().markSynced(acceptedIds, now, notAfter = now)
                graph.db.syncQueueDao().remove(acceptedIds)
                if (rejectedIds.isNotEmpty()) graph.db.syncQueueDao().recordFailure(rejectedIds.toList(), "rejected")
                // Rejected rows stay queued for a human to look at; they do not block the rest.
                uploaded += acceptedIds.size
                rejected += rejectedIds.size
                graph.settings.set(SettingsKeys.NextReportAt, response.nextReportAt)
                batches++
            }
            graph.settings.set(SettingsKeys.LastSyncAt, System.currentTimeMillis())
            graph.settings.set(SettingsKeys.LastSyncError, null)
            return if (uploaded == 0 && rejected == 0) Outcome.NothingToDo else Outcome.Done(uploaded, rejected)
        } catch (e: SyncClient.NotConfigured) {
            return Outcome.NotConfigured
        } catch (e: SyncClient.ServerError) {
            graph.settings.set(SettingsKeys.LastSyncError, "server ${e.status}")
            return if (e.retryable) Outcome.Retry("server ${e.status}") else Outcome.Failed("server ${e.status}")
        } catch (e: Exception) {
            // Network errors and the like: no body, no URL in the message, just the class.
            graph.settings.set(SettingsKeys.LastSyncError, e.javaClass.simpleName)
            return Outcome.Retry(e.javaClass.simpleName)
        } finally {
            client.close()
        }
    }

    companion object {
        const val BATCH = 500
        const val MAX_BATCHES_PER_RUN = 20
    }
}

/** WorkManager wrapper: exponential backoff on retry, network required. */
class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val graph = HesabuApplication.graph(applicationContext)
        val syncer = Syncer(graph) { url -> SyncClient(url, { graph.secrets.deviceToken }) }
        return when (val out = syncer.syncOnce()) {
            is Syncer.Outcome.Done, Syncer.Outcome.NothingToDo, Syncer.Outcome.NotConfigured -> Result.success()
            is Syncer.Outcome.Retry -> if (runAttemptCount < 6) Result.retry() else Result.failure()
            is Syncer.Outcome.Failed -> { Log.w(TAG, "sync failed: ${out.reason}"); Result.failure() }
        }
    }

    companion object {
        const val TAG = "SyncWorker"
        const val UNIQUE_NAME = "hesabu-sync"
        const val PERIODIC_NAME = "hesabu-sync-periodic"
    }
}

object SyncScheduler {
    private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** After new rows land: one sync soon, with backoff 30 s, 60 s, 120 s ... */
    fun requestSoon(context: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(network)
            .setInitialDelay(5, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(SyncWorker.UNIQUE_NAME, ExistingWorkPolicy.KEEP, req)
    }

    /** Safety net every six hours for anything the immediate sync could not deliver. */
    fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(network)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(SyncWorker.PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }
}
