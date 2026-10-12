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
) {
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
    val packId: String,
    val packVersion: String,
    val familyId: String,
    val provider: String,
    val accountRef: String,
    val type: String,
    val direction: String,
    val counterpartyKind: String,
    val isTransferHint: Boolean,
    val amountCents: Long,
    val feeCents: Long,
    val balanceAfterCents: Long?,
    /** ISO 8601 with +03:00. */
    val occurredAt: String,
    val externalRef: String?,
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
    val rawHash: String,
    val receivedAtMillis: Long,
    val source: MessageSource,
) {
    val occurredAtMillis: Long get() = Normalisers.isoToEpochMillis(occurredAt)
}

/** The engine's verdict on one message. */
sealed interface ParseResult {
    /** A family matched and produced a transaction. */
    data class Parsed(val transaction: ParsedTransaction) : ParseResult

    /** A family with `ignore: true` consumed the message (balance query, failure notice). */
    data class Ignored(val packId: String, val packVersion: String, val familyId: String) : ParseResult

    /** A known sender, but no family matched: store encrypted, count, surface in "Teach Hesabu". */
    data class Unknown(val packIds: List<String>) : ParseResult

    /** Not a money sender. The body was never read beyond the sender check. */
    data object NotMoneySender : ParseResult
}
