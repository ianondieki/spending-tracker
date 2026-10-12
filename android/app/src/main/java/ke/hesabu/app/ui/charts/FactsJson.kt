package ke.hesabu.app.ui.charts

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Tolerant readers for FactsSheet JSON. Every accessor returns null for the wrong shape instead of throwing, so a
 * malformed sheet degrades to an empty chart rather than a crash.
 */
internal object FactsJson {

    fun JsonElement?.asObject(): JsonObject? = this as? JsonObject

    fun JsonElement?.asArray(): JsonArray? = this as? JsonArray

    /** A non-blank string value. */
    fun JsonElement?.asText(): String? {
        val p = this as? JsonPrimitive ?: return null
        if (p is JsonNull || !p.isString) return null
        return p.content.trim().takeIf { it.isNotEmpty() }
    }

    /** A whole number, from an integer, a finite double, or a numeric string. */
    fun JsonElement?.asLong(): Long? {
        val p = this as? JsonPrimitive ?: return null
        if (p is JsonNull) return null
        p.longOrNull?.let { return it }
        val d = p.doubleOrNull ?: return null
        return if (d.isFinite() && kotlin.math.abs(d) < 9.0e15) Math.round(d) else null
    }

    fun JsonElement?.asBool(): Boolean? {
        val p = this as? JsonPrimitive ?: return null
        if (p is JsonNull) return null
        return p.booleanOrNull
    }

    /** Money as integer cents: a bare number, or a FactsSheet Money object `{cents, display}`. */
    fun JsonElement?.moneyCents(): Long? = when (this) {
        is JsonObject -> this["cents"].asLong()
        is JsonPrimitive -> asLong()
        else -> null
    }

    /** Whole percent from a FactsSheet Pct object `{value, display}` or a bare number. */
    fun JsonElement?.percentValue(): Int? = when (this) {
        is JsonObject -> this["value"].asLong()?.toInt()
        is JsonPrimitive -> asLong()?.toInt()
        else -> null
    }
}
