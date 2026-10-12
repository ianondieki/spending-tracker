package ke.hesabu.app.ui.charts

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import ke.hesabu.app.ui.charts.FactsJson.asArray
import ke.hesabu.app.ui.charts.FactsJson.asBool
import ke.hesabu.app.ui.charts.FactsJson.asLong
import ke.hesabu.app.ui.charts.FactsJson.asObject
import ke.hesabu.app.ui.charts.FactsJson.asText
import ke.hesabu.app.ui.charts.FactsJson.moneyCents
import ke.hesabu.app.ui.charts.FactsJson.percentValue
import ke.hesabu.app.ui.theme.DarkHesabuColors
import ke.hesabu.app.ui.theme.LightHesabuColors
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/**
 * Maps the FactsSheet (kept as JSON) to the data each Compose chart draws, following the shapes in
 * contracts/chart-spec.md. Tolerant by design: both the catalogue shape (`{name, cents, display, color}`) and the
 * FactsSheet shapes (`CategoryFact`, `MerchantFact`, `PersonFact`, `DayFact`) are accepted, malformed entries are
 * skipped, and a chart with nothing usable maps to null so the UI shows a quiet empty state.
 *
 * Pure functions, no Android types: unit-tested on the JVM.
 */
object ChartMappers {

    /** From the design tokens: at most six donut slices, Other included. */
    const val MAX_DONUT_SLICES = 6
    const val MAX_TOP_BARS = 8

    /** Where an entry's amount may live, in order: catalogue shape first, then the FactsSheet facts. */
    private val CENTS_KEYS = listOf("cents", "out", "amount", "sent")

    /** Dispatch by `chart_type`; null for an unknown type or unusable data. */
    fun map(chartType: String, facts: JsonElement?, dataRef: String, locale: String, otherLabel: String): ChartData? =
        when (chartType) {
            "donut" -> donut(facts, dataRef, locale, otherLabel)
            "daily_bars" -> dailyBars(facts, dataRef, locale)
            "top_bars" -> topBars(facts, dataRef, locale)
            "fee_meter" -> feeMeter(facts, dataRef)
            "balance_sparkline" -> sparkline(facts, dataRef)
            else -> null
        }

    /** `donut`: largest first, the tail past [MAX_DONUT_SLICES] (and any explicit Other) folded into one Other slice. */
    fun donut(facts: JsonElement?, ref: String, locale: String, otherLabel: String): DonutData? {
        val arr = JsonPointer.resolve(facts, ref).asArray() ?: return null
        class Raw(val name: String, val cents: Long, val other: Boolean, val hint: Int?)
        val raw = arr.mapNotNull { e ->
            val o = e.asObject() ?: return@mapNotNull null
            val cents = centsOf(o)?.takeIf { it > 0 } ?: return@mapNotNull null
            val name = nameOf(o, locale) ?: return@mapNotNull null
            Raw(name, cents, isOtherEntry(o), slotHint(o))
        }
        if (raw.isEmpty()) return null
        val named = raw.filterNot { it.other }.sortedByDescending { it.cents }
        var otherCents = raw.filter { it.other }.sumOf { it.cents }
        val needsOther = otherCents > 0 || named.size > MAX_DONUT_SLICES
        val keep = if (needsOther) minOf(named.size, MAX_DONUT_SLICES - 1) else named.size
        val kept = named.take(keep)
        otherCents += named.drop(keep).sumOf { it.cents }
        val total = kept.sumOf { it.cents } + otherCents
        if (total <= 0) return null

        // Colour follows the entity when the sheet names a slot; the rest fill the free slots in order.
        val used = mutableSetOf<Int>()
        val hinted = kept.map { r -> r.hint?.takeIf { it in 0 until MAX_DONUT_SLICES && used.add(it) } }
        var next = 0
        val slots = hinted.map { h ->
            h ?: run {
                while (next in used) next++
                used.add(next)
                next
            }
        }
        val slices = kept.mapIndexed { i, r -> DonutSlice(r.name, r.cents, percentHalfUp(r.cents, total), slots[i]) }
        val other = if (otherCents > 0) listOf(DonutSlice(otherLabel, otherCents, percentHalfUp(otherCents, total), null)) else emptyList()
        return DonutData(slices + other, total)
    }

    /** `daily_bars`: one bar per day in sheet order; the average comes from `/average_daily_out` when present. */
    fun dailyBars(facts: JsonElement?, ref: String, locale: String): DailyBarsData? {
        val arr = JsonPointer.resolve(facts, ref).asArray() ?: return null
        val monthly = arr.size > 7
        val bars = arr.mapIndexedNotNull { i, e ->
            val o = e.asObject() ?: return@mapIndexedNotNull null
            val cents = centsOf(o) ?: return@mapIndexedNotNull null
            DayBar(
                label = dayLabel(o, locale) ?: (i + 1).toString(),
                axisLabel = axisLabel(o, locale, i, monthly),
                cents = cents.coerceAtLeast(0),
            )
        }
        if (bars.isEmpty()) return null
        val average = JsonPointer.resolve(facts, "/average_daily_out").moneyCents()?.takeIf { it >= 0 }
            ?: divideHalfUp(bars.sumOf { it.cents }, bars.size.toLong())
        val max = bars.maxOf { it.cents }
        val spendiest = if (max > 0) bars.indexOfFirst { it.cents == max } else null
        return DailyBarsData(bars, average, spendiest)
    }

    /** `top_bars`: merchants or people, largest first, at most [MAX_TOP_BARS]. */
    fun topBars(facts: JsonElement?, ref: String, locale: String): TopBarsData? {
        val arr = JsonPointer.resolve(facts, ref).asArray() ?: return null
        val items = arr.mapNotNull { e ->
            val o = e.asObject() ?: return@mapNotNull null
            val cents = centsOf(o)?.takeIf { it > 0 } ?: return@mapNotNull null
            val name = nameOf(o, locale) ?: return@mapNotNull null
            RankedBar(name, cents, o["is_new"].asBool() ?: false)
        }.sortedByDescending { it.cents }.take(MAX_TOP_BARS)
        return if (items.isEmpty()) null else TopBarsData(items)
    }

    /**
     * `fee_meter`: fees at [ref] (normally `/totals/fees`); the ratio from the sibling `fee_ratio`, sized from the
     * sibling `out` when present so the bar is exact while the label keeps the sheet's whole percent.
     */
    fun feeMeter(facts: JsonElement?, ref: String): FeeMeterData? {
        val at = JsonPointer.resolve(facts, ref)
        val (base, feesElement) = if (at is JsonObject && at["cents"] == null && at["fees"] != null) {
            ref.trimEnd('/') to at["fees"]
        } else {
            JsonPointer.parent(ref) to at
        }
        val fees = feesElement.moneyCents()?.takeIf { it >= 0 } ?: return null
        val sheetPct = JsonPointer.resolve(facts, "$base/fee_ratio").percentValue()
        val out = JsonPointer.resolve(facts, "$base/out").moneyCents()?.takeIf { it > 0 }
        val ratio = when {
            out != null -> fees.toDouble() / out
            sheetPct != null -> sheetPct / 100.0
            else -> null
        }
        val pct = sheetPct ?: out?.let { percentHalfUp(fees, it) }
        return FeeMeterData(fees, ratio, pct)
    }

    /** `balance_sparkline`: `/accounts/i/balance_series` (or the account object itself); needs two points. */
    fun sparkline(facts: JsonElement?, ref: String): SparklineData? {
        val at = JsonPointer.resolve(facts, ref)
        val (series, owner) = when (at) {
            is JsonArray -> at to JsonPointer.resolve(facts, JsonPointer.parent(ref)).asObject()
            is JsonObject -> at["balance_series"].asArray() to at
            else -> return null
        }
        val points = series?.mapNotNull { e ->
            val o = e.asObject() ?: return@mapNotNull null
            val time = o["at"].asText() ?: return@mapNotNull null
            val cents = o["cents"].asLong() ?: return@mapNotNull null
            BalancePoint(time, cents)
        }.orEmpty()
        if (points.size < 2) return null
        return SparklineData(owner?.get("label").asText(), points)
    }

    /** Whole percent of [part] in [total], rounded half up, as the FactsSheet does. */
    fun percentHalfUp(part: Long, total: Long): Int =
        if (total <= 0) 0 else divideHalfUp(part * 100, total).toInt()

    private fun divideHalfUp(a: Long, b: Long): Long =
        if (b == 0L) 0 else if (a >= 0) (2 * a + b) / (2 * b) else -((2 * -a + b) / (2 * b))

    private fun centsOf(o: JsonObject): Long? {
        for (key in CENTS_KEYS) {
            val v = o[key] ?: continue
            v.moneyCents()?.let { return it }
        }
        return null
    }

    private fun nameOf(o: JsonObject, locale: String): String? {
        val localised = if (locale == "sw") listOf("name_sw", "label_sw") else listOf("name_en", "label_en")
        val other = if (locale == "sw") listOf("name_en", "label_en") else listOf("name_sw", "label_sw")
        return (localised + listOf("name", "label", "merchant", "source") + other + "category_id")
            .firstNotNullOfOrNull { o[it].asText() }
    }

    private fun isOtherEntry(o: JsonObject): Boolean =
        o["is_other"].asBool() == true || o["category_id"].asText() == "other" ||
            o["name_en"].asText()?.equals("Other", ignoreCase = true) == true ||
            o["name"].asText()?.equals("Other", ignoreCase = true) == true

    /** A colour slot from `color`: a slot number, or a hex from either theme's categorical ramp. */
    private fun slotHint(o: JsonObject): Int? {
        val c = o["color"] ?: return null
        c.asLong()?.let { return it.toInt() }
        val hex = c.asText()?.removePrefix("#")?.uppercase() ?: return null
        val light = LightHesabuColors.categorical.map { it.hex() }
        val dark = DarkHesabuColors.categorical.map { it.hex() }
        return light.indexOf(hex).takeIf { it >= 0 } ?: dark.indexOf(hex).takeIf { it >= 0 }
    }

    private fun Color.hex(): String = String.format(Locale.ROOT, "%06X", toArgb() and 0xFFFFFF)

    private fun dayLabel(o: JsonObject, locale: String): String? {
        val keys = if (locale == "sw") listOf("weekday_sw", "label", "weekday_en") else listOf("weekday_en", "label", "weekday_sw")
        return keys.firstNotNullOfOrNull { o[it].asText() } ?: o["date"].asText()
    }

    /**
     * Short labels under the bars. Weekly in English: Mon to Sun. Weekly in Kiswahili: the day of the month,
     * because the weekday names share the prefix "Juma". Monthly: the day of the month on every seventh bar.
     */
    private fun axisLabel(o: JsonObject, locale: String, index: Int, monthly: Boolean): String {
        val date = o["date"].asText()?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
        if (monthly) return if (index % 7 == 0) (date?.dayOfMonth ?: (index + 1)).toString() else ""
        o["label"].asText()?.takeIf { it.length <= 4 }?.let { return it }
        if (locale == "sw") return (date?.dayOfMonth ?: (index + 1)).toString()
        date?.let { return it.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH) }
        return o["weekday_en"].asText()?.take(3) ?: (index + 1).toString()
    }
}
