package ke.hesabu.app.sync

import ke.hesabu.app.data.AccountEntity
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.parse.pack.Normalisers
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/*
 * Wire models for contracts/transaction.schema.json and openapi.yaml. Raw message bodies have no field here, by
 * construction: nothing in this file can carry one.
 */

@Serializable
data class WireCounterparty(
    val name: String? = null,
    val kind: String,
    @SerialName("ref_masked") val refMasked: String? = null,
    val paybill: String? = null,
    val till: String? = null,
    @SerialName("account_ref") val accountRef: String? = null,
)

@Serializable
data class WireParser(@SerialName("pack_id") val packId: String, @SerialName("pack_version") val packVersion: String, @SerialName("family_id") val familyId: String)

@Serializable
data class WireTransaction(
    val id: String,
    @SerialName("account_ref") val accountRef: String,
    val provider: String,
    @SerialName("external_ref") val externalRef: String? = null,
    val type: String,
    val direction: String,
    @SerialName("amount_cents") val amountCents: Long,
    @SerialName("fee_cents") val feeCents: Long,
    @SerialName("balance_after_cents") val balanceAfterCents: Long? = null,
    @SerialName("occurred_at") val occurredAt: String,
    @SerialName("received_at") val receivedAt: String,
    val counterparty: WireCounterparty,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("category_source") val categorySource: String,
    @SerialName("category_confidence") val categoryConfidence: Double,
    @SerialName("is_transfer") val isTransfer: Boolean,
    @SerialName("transfer_pair_id") val transferPairId: String? = null,
    @SerialName("parse_confidence") val parseConfidence: Double,
    val source: String,
    @SerialName("raw_hash") val rawHash: String,
    val parser: WireParser,
    @SerialName("user_edited") val userEdited: Boolean,
    val note: String? = null,
    val tags: List<String> = emptyList(),
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
data class WireAccount(
    @SerialName("account_ref") val accountRef: String,
    val provider: String,
    val institution: String? = null,
    val label: String,
    val mask: String? = null,
    @SerialName("last_balance_cents") val lastBalanceCents: Long? = null,
    @SerialName("last_balance_at") val lastBalanceAt: String? = null,
)

@Serializable
data class SyncRequest(
    @SerialName("device_id") val deviceId: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("parser_version") val parserVersion: String,
    val accounts: List<WireAccount>,
    val transactions: List<WireTransaction>,
    @SerialName("unknown_message_count") val unknownMessageCount: Int,
    @SerialName("sent_at") val sentAt: String,
)

@Serializable
data class SyncRejected(val id: String, val reason: String)

@Serializable
data class SyncResponse(
    val accepted: Int,
    val rejected: List<SyncRejected> = emptyList(),
    @SerialName("server_time") val serverTime: String,
    @SerialName("next_report_at") val nextReportAt: String? = null,
)

@Serializable
data class RegisterRequest(
    @SerialName("device_id") val deviceId: String,
    val platform: String = "android",
    @SerialName("app_version") val appVersion: String,
    @SerialName("display_name") val displayName: String? = null,
)

/** POST /v1/reports/generate body (openapi.yaml): `deliver` and `force` are booleans, never strings. */
@Serializable
data class GenerateRequest(val kind: String, val period: String, val deliver: Boolean = false, val force: Boolean = false)

@Serializable
data class RegisterResponse(@SerialName("device_token") val deviceToken: String, @SerialName("user_id") val userId: String)

@Serializable
data class WirePreferences(
    val email: String? = null,
    @SerialName("whatsapp_e164") val whatsappE164: String? = null,
    val locale: String? = null,
    @SerialName("week_start") val weekStart: String? = null,
    @SerialName("weekly_at") val weeklyAt: String? = null,
    @SerialName("monthly_at") val monthlyAt: String? = null,
    val channels: List<String>? = null,
    val theme: String? = null,
)

@Serializable
data class ApiError(val code: String = "", val message: String = "")

/** Lenient JSON for responses (the server may add fields); requests are emitted without nulls. */
val WireJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    // Booleans such as `deliver = false` must reach the wire; the API's schema requires them.
    encodeDefaults = true
}

/** Maps ledger rows to the wire. The body never existed on the entity, so it cannot leak here. */
object WireMapper {
    private val tagsJson = Json

    fun transaction(t: TransactionEntity): WireTransaction = WireTransaction(
        id = t.id,
        accountRef = t.accountRef,
        provider = t.provider,
        externalRef = t.externalRef,
        type = t.type,
        direction = t.direction,
        amountCents = t.amountCents,
        feeCents = t.feeCents,
        balanceAfterCents = t.balanceAfterCents,
        occurredAt = Normalisers.epochMillisToIso(t.occurredAtMillis),
        receivedAt = Normalisers.epochMillisToIso(t.receivedAtMillis),
        counterparty = WireCounterparty(
            name = t.counterpartyName?.take(120),
            kind = t.counterpartyKind,
            refMasked = t.counterpartyRefMasked,
            paybill = t.paybill,
            till = t.till,
            accountRef = t.counterpartyAccountRef,
        ),
        categoryId = t.categoryId,
        categorySource = t.categorySource,
        categoryConfidence = t.categoryConfidence,
        isTransfer = t.isTransfer,
        transferPairId = t.transferPairId,
        parseConfidence = t.parseConfidence,
        source = t.source,
        rawHash = t.rawHash,
        parser = WireParser(t.packId, t.packVersion, t.familyId),
        userEdited = t.userEdited,
        note = t.note?.take(500),
        tags = parseTags(t.tags),
        updatedAt = Normalisers.epochMillisToIso(t.updatedAtMillis),
    )

    fun account(a: AccountEntity): WireAccount = WireAccount(
        accountRef = a.accountRef,
        provider = a.provider,
        institution = a.institution,
        label = a.label,
        mask = a.mask,
        lastBalanceCents = a.lastBalanceCents,
        lastBalanceAt = a.lastBalanceAtMillis?.let(Normalisers::epochMillisToIso),
    )

    fun parseTags(json: String): List<String> =
        runCatching { (tagsJson.parseToJsonElement(json) as JsonArray).map { it.jsonPrimitive.content } }.getOrDefault(emptyList()).take(20)

    fun tagsToJson(tags: List<String>): String = tagsJson.encodeToString(ListSerializer(String.serializer()), tags)
}
