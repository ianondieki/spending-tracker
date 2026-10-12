package ke.hesabu.app.ingest

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Receives `SMS_RECEIVED` broadcasts so money messages are ingested as they arrive.
 *
 * STUB: the real logic (provider detection against contracts/provider-packs/, parsing, dedupe,
 * persisting to the encrypted ledger, scheduling sync) comes with Lane A's ingestion work.
 *
 * Rules that already apply here (master prompt §2, §6):
 *  - Message bodies are untrusted data and are never logged or sent anywhere; only counts are logged.
 *  - Nothing is aborted: the receiver never consumes the broadcast, so the user's SMS app still gets it.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val senders = messages.mapNotNull { it.displayOriginatingAddress }.distinct()
        Log.d(TAG, "Received ${messages.size} SMS part(s) from ${senders.size} sender(s); ingestion not wired yet")
        // TODO(Lane A): enqueue an IngestWorker with the concatenated body + sender + timestamp.
    }

    private companion object {
        const val TAG = "SmsReceiver"
    }
}
