package ke.hesabu.app.data

import ke.hesabu.app.parse.pack.ParsedTransaction

/**
 * Category resolution, in the order the kickoff fixes: user rule → merchant seed → provider default → none.
 * Pure: give it the rules and seeds, it never touches the database, so it is trivially testable.
 */
class Categoriser(rules: List<UserRuleEntity>, seeds: List<MerchantSeedEntity>) {

    data class Resolution(val categoryId: String?, val source: String, val confidence: Double, val markTransfer: Boolean = false)

    private val rulesByKey: Map<String, UserRuleEntity> = rules.associateBy { key(it.matchKind, it.matchValue) }
    private val seedsByKey: Map<String, MerchantSeedEntity> = seeds.associateBy { key(it.matchKind, it.matchValue) }
    private val nameSeedsByPrefix: List<MerchantSeedEntity> = seeds.filter { it.matchKind == "name" }.sortedByDescending { it.matchValue.length }

    fun resolve(tx: ParsedTransaction): Resolution {
        val candidates = candidates(tx.counterpartyName, tx.paybill, tx.till, tx.type)
        for (k in candidates) rulesByKey[k]?.let { return Resolution(it.categoryId, "user", 1.0, it.markTransfer) }
        for (k in candidates) seedsByKey[k]?.let { return Resolution(it.categoryId, "merchant", it.confidence) }
        // A seed may name a merchant prefix ("naivas" for "NAIVAS WESTLANDS").
        val name = tx.counterpartyName?.let { normalise(it, "name") }
        if (name != null) nameSeedsByPrefix.firstOrNull { name.startsWith(it.matchValue + " ") || name == it.matchValue }
            ?.let { return Resolution(it.categoryId, "merchant", it.confidence * 0.9) }
        tx.defaultCategoryId?.let { return Resolution(it, "provider_default", 0.6) }
        return Resolution(null, "none", 0.0)
    }

    /** The match keys the ledger row offers, most specific first. */
    fun candidates(name: String?, paybill: String?, till: String?, type: String): List<String> = buildList {
        till?.let { add(key("till", it)) }
        paybill?.let { add(key("paybill", it)) }
        name?.let { add(key("name", it)) }
        add(key("type", type))
    }

    companion object {
        fun normalise(value: String, kind: String): String = when (kind) {
            "type" -> value.trim().uppercase()
            "paybill", "till" -> value.filter { it.isDigit() }
            else -> value.trim().lowercase().replace(Regex("\\s+"), " ")
        }

        fun key(kind: String, value: String) = "$kind:${normalise(value, kind)}"
    }
}
