package ke.hesabu.app.ingest

import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.ParseResult

/**
 * The share-to-app and paste import paths (no SMS permission needed). Pasted or shared text carries no sender, so
 * each block is tried against every pack; the pack that parses it supplies the sender. Blocks that no pack
 * understands are stored as unknown messages from the sender "shared".
 */
class TextImport(private val engine: PackEngine, private val pipeline: IngestPipeline) {

    data class Prepared(val messages: List<InboundMessage>, val skippedBlocks: Int)

    /** Splits text into candidate messages: blank-line separated blocks, else one block per line that looks like a message. */
    fun split(text: String): List<String> {
        val blocks = text.replace("\r\n", "\n").split(Regex("\n\\s*\n")).map { it.trim() }.filter { it.isNotEmpty() }
        if (blocks.size > 1) return blocks
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        return if (lines.size > 1 && lines.count { looksLikeMessageStart(it) } > 1) lines else blocks
    }

    private fun looksLikeMessageStart(line: String) = Regex("^[A-Z0-9]{10} Confirmed", RegexOption.IGNORE_CASE).containsMatchIn(line)

    fun prepare(text: String, receivedAtMillis: Long, source: MessageSource): Prepared {
        val blocks = split(text)
        var skipped = 0
        val messages = blocks.mapNotNull { body ->
            val sender = engine.senderFor(body) ?: run { skipped++; null }
            sender?.let { InboundMessage(it, body, receivedAtMillis, source) }
        }
        return Prepared(messages, skipped)
    }

    /** What the text would become, without writing anything: counts per family, ignored and unrecognised blocks. */
    data class Preview(val perFamily: Map<String, Int>, val ignored: Int, val unknown: Int, val blocks: Int) {
        val parsed: Int get() = perFamily.values.sum()
        val isEmpty: Boolean get() = blocks == 0
    }

    fun preview(text: String): Preview {
        val blocks = split(text)
        val perFamily = LinkedHashMap<String, Int>()
        var ignored = 0
        var unknown = 0
        for (body in blocks) {
            val sender = engine.senderFor(body)
            if (sender == null) { unknown++; continue }
            when (val r = engine.parse(InboundMessage(sender, body, 0))) {
                is ParseResult.Parsed -> perFamily.merge(r.transaction.familyId, 1, Int::plus)
                is ParseResult.Ignored -> ignored++
                else -> unknown++
            }
        }
        return Preview(perFamily, ignored, unknown, blocks.size)
    }

    suspend fun import(text: String, receivedAtMillis: Long, source: MessageSource, tags: List<String> = emptyList()): Pair<IngestPipeline.Report, Int> {
        val prepared = prepare(text, receivedAtMillis, source)
        val report = pipeline.ingest(prepared.messages, tags)
        // Blocks that no pack claims still go to "Teach Hesabu" under the shared pseudo-sender.
        val unknownBlocks = split(text).filter { engine.senderFor(it) == null }.map { InboundMessage(SHARED_SENDER, it, receivedAtMillis, source) }
        val unknownReport = if (unknownBlocks.isNotEmpty()) pipeline.storeUnknown(unknownBlocks) else IngestPipeline.Report()
        return (report + unknownReport) to prepared.skippedBlocks
    }

    companion object {
        const val SHARED_SENDER = "shared"
    }
}

/** For text without a sender: the first pack (in load order) whose families parse or ignore the body names the sender. */
fun PackEngine.senderFor(body: String): String? {
    for (pack in packs) {
        val sender = pack.senderIds.first()
        when (parse(InboundMessage(sender, body, 0))) {
            is ParseResult.Parsed, is ParseResult.Ignored -> return sender
            else -> {}
        }
    }
    return null
}
