package ke.hesabu.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * Periodic upload of new ledger rows. STUB: returns success until the sync protocol
 * (contracts/openapi.yaml) is implemented by Lane A.
 */
class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = Result.success()

    companion object {
        const val UNIQUE_NAME = "hesabu-sync"
    }
}
