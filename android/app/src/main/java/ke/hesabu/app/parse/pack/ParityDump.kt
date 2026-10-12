package ke.hesabu.app.parse.pack

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive

/**
 * Cross-engine parity dumps (corpus/expected/README.md): every input line becomes one canonical JSON object, keys
 * sorted at every level, no whitespace, `\n` after every line. The TypeScript engine writes these files; this
 * engine must reproduce them byte for byte.
 */
object ParityDump {

    const val UNKNOWN_RECEIVED_AT = "2000-01-01T00:00:00+03:00"
    val CORPUS_VARIABLES = mapOf("sim_msisdn_masked" to "07XXXXX000", "acct_mask" to "***000")
    val DEMO_VARIABLES = mapOf("sim_msisdn_masked" to "07XXXXX123", "acct_mask" to "XXX456")

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    data class Line(val sender: String, val body: String, val receivedAt: String?)

    /** Reads a corpus JSONL; a line without `received_at` gets the sentinel. */
    fun readJsonl(text: String): List<Line> = text.split('\n').filter { it.isNotBlank() }.map { raw ->
        val o = json.parseToJsonElement(raw) as JsonObject
        val r = o["received_at"]
        Line(o["sender"]!!.jsonPrimitive.content, o["body"]!!.jsonPrimitive.content, (r as? JsonPrimitive)?.takeIf { it.isString }?.content)
    }

    /** One file: parse every line in order, dedupe across the file, pair transfers among the kept rows. */
    fun dumpFile(engine: PackEngine, lines: List<Line>): String {
        val messages = lines.map { l ->
            val iso = l.receivedAt ?: UNKNOWN_RECEIVED_AT
            InboundMessage(l.sender, l.body, Normalisers.isoToEpochMillis(iso), MessageSource.Import, receivedAtIso = iso)
        }
        val outcomes = messages.map { engine.parse(it) }
        val parsed = outcomes.mapNotNull { (it as? ParseResult.Parsed)?.transaction }
        val kept = PostProcessor.dedupe(parsed).kept
        val pairs = PostProcessor.pairIds(kept)
        val keptIds = kept.map { it.id }.toSet()
        val seen = HashSet<String>()
        val sb = StringBuilder()
        outcomes.forEachIndexed { index, o ->
            val base = linkedMapOf<String, Any?>("index" to index, "sender" to lines[index].sender, "received_at" to lines[index].receivedAt)
            val obj: Map<String, Any?> = when (o) {
                ParseResult.NotMoneySender -> base + ("outcome" to "not_ours")
                is ParseResult.Unknown -> base + mapOf("outcome" to "unknown", "raw_hash" to messages[index].rawHash)
                is ParseResult.Ignored -> base + mapOf(
                    "outcome" to "ignored", "family_id" to o.familyId, "raw_hash" to o.rawHash, "amount_cents" to o.amountCents,
                    "balance_after_cents" to o.balanceAfterCents, "occurred_at" to o.occurredAt, "external_ref" to o.externalRef,
                )
                is ParseResult.Parsed -> {
                    val t = o.transaction
                    val duplicate = t.id in seen || t.id !in keptIds
                    seen.add(t.id)
                    base + mapOf(
                        "outcome" to if (duplicate) "duplicate" else "parsed",
                        "id" to t.id, "account_ref" to t.accountRef, "provider" to t.provider, "external_ref" to t.externalRef,
                        "family_id" to t.familyId, "pack_id" to t.packId, "pack_version" to t.packVersion, "type" to t.type,
                        "direction" to t.direction, "amount_cents" to t.amountCents, "fee_cents" to t.feeCents,
                        "balance_after_cents" to t.balanceAfterCents, "occurred_at" to t.occurredAt,
                        "counterparty" to mapOf(
                            "name" to t.counterpartyName, "kind" to t.counterpartyKind, "ref_masked" to t.counterpartyRef,
                            "paybill" to t.paybill, "till" to t.till, "account_ref" to t.counterpartyAccountRef,
                        ),
                        "is_transfer" to (!duplicate && pairs.containsKey(t.id)),
                        "transfer_pair_id" to if (duplicate) null else pairs[t.id],
                        "parse_confidence" to t.parseConfidence, "raw_hash" to t.rawHash, "note" to t.note,
                    )
                }
            }
            sb.append(canonical(obj)).append('\n')
        }
        return sb.toString()
    }

    /** JSON with keys sorted recursively and no whitespace, numbers as JavaScript prints them. */
    fun canonical(value: Any?): String = when (value) {
        null -> "null"
        is Boolean -> value.toString()
        is Int, is Long -> value.toString()
        is Double -> if (value == Math.floor(value) && !value.isInfinite() && abs(value) < 1e15) value.toLong().toString() else value.toString()
        is Float -> canonical(value.toDouble())
        is String -> quote(value)
        is Map<*, *> -> value.entries.map { it.key.toString() to it.value }.sortedBy { it.first }.joinToString(",", "{", "}") { quote(it.first) + ":" + canonical(it.second) }
        is List<*> -> value.joinToString(",", "[", "]") { canonical(it) }
        else -> quote(value.toString())
    }

    private fun abs(d: Double) = if (d < 0) -d else d

    /** JSON.stringify string escaping: only quotes, backslashes and control characters. */
    fun quote(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) {
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c == '\b' -> sb.append("\\b")
                c == '\u000c' -> sb.append("\\f")
                c < ' ' -> sb.append(String.format("\\u%04x", c.code))
                else -> sb.append(c)
            }
        }
        return sb.append('"').toString()
    }
}
