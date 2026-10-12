package ke.hesabu.app.parse.pack

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/*
 * The provider pack format, mirroring contracts/provider-pack.schema.json field for field. A pack is data: this
 * file only describes it; PackEngine executes it. Unknown keys are rejected so a pack that drifts from the schema
 * fails to load rather than silently misbehaving.
 */

@Serializable
data class ProviderPack(
    @SerialName("pack_id") val packId: String,
    val version: String,
    val provider: String,
    val institution: String? = null,
    @SerialName("sender_ids") val senderIds: List<String>,
    @SerialName("account_ref_template") val accountRefTemplate: String,
    val currency: String = "KES",
    @SerialName("datetime_formats") val datetimeFormats: List<String>,
    @SerialName("amount_prefixes") val amountPrefixes: List<String>,
    val families: List<Family>,
) {
    /** Lower-cased sender ids, the form the sender filter compares against. */
    val senderKeys: Set<String> by lazy { senderIds.map { it.trim().lowercase() }.toSet() }
}

@Serializable
data class Family(
    @SerialName("family_id") val familyId: String,
    val description: String,
    val type: String,
    val direction: String,
    @SerialName("counterparty_kind") val counterpartyKind: String,
    @SerialName("is_transfer_hint") val isTransferHint: Boolean = false,
    val ignore: Boolean = false,
    val prefilter: Prefilter? = null,
    val pattern: String,
    val fields: Map<String, FieldMapping>,
    val defaults: Defaults? = null,
    val confidence: Double = 0.95,
    val examples: List<Example>,
)

@Serializable
data class Prefilter(
    @SerialName("all_of") val allOf: List<String> = emptyList(),
    @SerialName("none_of") val noneOf: List<String> = emptyList(),
)

@Serializable
data class FieldMapping(
    val to: String,
    val normalise: String,
    val optional: Boolean = false,
)

@Serializable
data class Defaults(
    @SerialName("fee_cents") val feeCents: Long? = null,
    @SerialName("counterparty_name") val counterpartyName: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
)

@Serializable
data class Example(
    val body: String,
    val verified: Boolean,
    val expect: JsonObject,
)

/** Strict JSON: unknown keys are errors, so a pack that does not match the schema does not load. */
val PackJson: Json = Json {
    ignoreUnknownKeys = false
    isLenient = false
    explicitNulls = false
}
