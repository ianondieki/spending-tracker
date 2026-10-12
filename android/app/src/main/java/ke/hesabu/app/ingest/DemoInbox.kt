package ke.hesabu.app.ingest

import android.content.Context
import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.parse.pack.Normalisers
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * Demo mode: `assets/demo/demo-inbox.jsonl` (Lane D's corpus/demo, copied at build time) or the built-in sample,
 * fed through the real pipeline so the app can be shown without SMS access. Rows are tagged "demo" so turning
 * demo mode off removes exactly them.
 */
object DemoInbox {

    const val TAG = "demo"
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun load(context: Context): List<InboundMessage> {
        val assets = context.assets
        val text = listOf("demo/demo-inbox.jsonl", "demo-builtin/demo-inbox.jsonl").firstNotNullOfOrNull { path ->
            runCatching { assets.open(path).bufferedReader().use { it.readText() } }.getOrNull()
        } ?: return emptyList()
        return parse(text)
    }

    /** One JSON object per line; tolerant about key names (sender/address/from, body/text/message, received_at/date/at). */
    fun parse(jsonl: String): List<InboundMessage> = jsonl.lineSequence().mapNotNull { line ->
        if (line.isBlank()) return@mapNotNull null
        val o = runCatching { json.parseToJsonElement(line) as? JsonObject }.getOrNull() ?: return@mapNotNull null
        fun s(vararg keys: String) = keys.firstNotNullOfOrNull { (o[it] as? JsonPrimitive)?.content }
        val sender = s("sender", "address", "from", "sender_id") ?: return@mapNotNull null
        val body = s("body", "text", "message") ?: return@mapNotNull null
        val at = o["received_at"] ?: o["date"] ?: o["at"] ?: o["timestamp"]
        val millis = when (at) {
            is JsonPrimitive -> at.longOrNull?.let { if (it < 100_000_000_000L) it * 1000 else it }
                ?: runCatching { Normalisers.isoToEpochMillis(at.content) }.getOrNull()
                ?: runCatching { java.time.Instant.parse(at.content).toEpochMilli() }.getOrNull()
            else -> null
        } ?: 0L
        InboundMessage(sender, body, millis, MessageSource.Import)
    }.toList()
}
