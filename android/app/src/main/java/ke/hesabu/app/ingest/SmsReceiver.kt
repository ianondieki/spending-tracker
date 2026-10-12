package ke.hesabu.app.ingest

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.MessageSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Receives `SMS_RECEIVED` and hands money messages to the ingest pipeline.
 *
 * Rules (master prompt §2, §6):
 *  - The sender check runs before anything else; messages from other senders are dropped unread.
 *  - Bodies are untrusted data and are never logged, persisted in WorkManager input, or sent anywhere.
 *  - The broadcast is never aborted, so the user's SMS app still receives the message.
 *  - Work runs inside goAsync() with a hard timeout; anything missed is caught by the six-hourly reconciliation.
 */
open class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (parts.isEmpty()) return

        val graph = HesabuApplication.graph(context)
        // Multipart messages arrive as several PDUs from one sender: join them in order.
        val sender = parts.firstOrNull()?.displayOriginatingAddress ?: return
        if (!graph.engine.isKnownSender(sender)) return
        val body = parts.mapNotNull { it.messageBody }.joinToString("")
        val at = parts.first().timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis()

        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                withTimeoutOrNull(RECEIVER_BUDGET_MS) {
                    graph.ensureTaxonomy()
                    val report = graph.pipeline.ingest(InboundMessage(sender, body, at, MessageSource.Sms))
                    if (report.parsed > 0 || report.unknown > 0) ke.hesabu.app.sync.SyncScheduler.requestSoon(context)
                } ?: Log.w(TAG, "live ingest timed out; reconciliation will catch up")
            } catch (t: Throwable) {
                Log.w(TAG, "live ingest failed: ${t.javaClass.simpleName}")
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        const val TAG = "SmsReceiver"
        const val RECEIVER_BUDGET_MS = 8_000L
    }
}
