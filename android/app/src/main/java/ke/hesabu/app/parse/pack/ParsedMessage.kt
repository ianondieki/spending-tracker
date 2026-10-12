package ke.hesabu.app.parse.pack

import java.security.MessageDigest

/** Where a message came from. Mirrors `Transaction.source` in the transaction schema. */
enum class MessageSource(val wire: String) { Sms("sms"), Notification("notification"), Import("import"), Manual("manual"), Share("share") }

/** One inbound message, before the engine sees it. [body] is untrusted data and never leaves this process. */
data class InboundMessage(
    val sender: String,
    val body: String,
    val receivedAtMillis: Long,
    val source: MessageSource = MessageSource.Sms,
    /** The received time exactly as the source wrote it (corpus lines); used verbatim for the occurred_at fallback. */
    val receivedAtIso: String? = null,
) {
    /** ISO 8601 +03:00 form of the received time, verbatim when the source supplied one. */
    val receivedAtText: String get() = receivedAtIso ?: Normalisers.epochMillisToIso(receivedAtMillis)

    /** SHA-256 of the body, the dedupe fallback and the only trace of the body that is ever stored unencrypted. */
    val rawHash: String by lazy { sha256(body) }

    companion object {
        fun sha256(text: String): String =
            MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}

/** What a family produced: everything the Transaction schema needs except the id, category and timestamps. */
data class ParsedTransaction(
    /** Deterministic: the same message gives the same id on every engine and run. */
    override val id: String,
    val packId: String,
    val packVersion: String,
    override val familyId: String,
    override val provider: String,
    override val accountRef: String,
    override val type: String,
    override val direction: String,
    override val counterpartyKind: String,
    override val isTransferHint: Boolean,
    override val amountCents: Long,
    override val feeCents: Long,
    override val balanceAfterCents: Long?,
    /** ISO 8601 with +03:00. */
    val occurredAt: String,
    override val externalRef: String?,
    val counterpartyName: String?,
    /** Masked phone or account. */
    val counterpartyRef: String?,
    val paybill: String?,
    val till: String?,
    /** Paybill account number as typed by the user, masked when it looks like a phone or ID. */
    val counterpartyAccountRef: String?,
    val note: String?,
    val parseConfidence: Double,
    /** The pack's default category, if any; the categoriser treats it as `provider_default`. */
    val defaultCategoryId: String?,
    override val rawHash: String,
    override val receivedAtMillis: Long,
    val source: MessageSource,
) : PostProcessor.LedgerLike {
    override val occurredAtMillis: Long get() = Normalisers.isoToEpochMillis(occurredAt)
}

/** The engine's verdict on one message. */
sealed interface ParseResult {
    /** A family matched and produced a transaction. */
    data class Parsed(val transaction: ParsedTransaction) : ParseResult

    /** A family with `ignore: true` consumed the message (balance query, failure notice). Captured fields are kept. */
    data class Ignored(
        val packId: String,
        val packVersion: String,
        val familyId: String,
        val rawHash: String = "",
        val amountCents: Long? = null,
        val balanceAfterCents: Long? = null,
        val occurredAt: String? = null,
        val externalRef: String? = null,
    ) : ParseResult

    /** A known sender, but no family matched: store encrypted, count, surface in "Teach Hesabu". */
    data class Unknown(val packIds: List<String>) : ParseResult

    /** Not a money sender. The body was never read beyond the sender check. */
    data object NotMoneySender : ParseResult
}
