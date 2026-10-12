package ke.hesabu.app.ui.reports

import ke.hesabu.app.parse.Money
import ke.hesabu.app.reports.Section
import ke.hesabu.app.ui.charts.FactsJson.moneyCents
import ke.hesabu.app.ui.charts.JsonPointer
import ke.hesabu.app.ui.theme.MoneyTone
import kotlinx.serialization.json.JsonObject

/**
 * Small pure rules the report renderer follows, kept apart so they are unit-tested: which number the hero tally
 * totals to, what fills the gap when the tally rows are only the top of the total, tone names to money tones, and
 * column widths for a table section.
 */
object ReportMath {

    /**
     * The hero total in cents. The FactsSheet's `/totals/out` wins when it formats to the document's `total_out`;
     * otherwise the document's own display string is parsed; the tally sum is the last resort. The total is never
     * invented: each source is a number the report already states.
     */
    fun heroTotalCents(hero: Section.Hero, facts: JsonObject?): Long {
        val fromFacts = JsonPointer.resolve(facts, "/totals/out").moneyCents()
        if (fromFacts != null && Money.formatKsh(fromFacts) == hero.totalOut.trim()) return fromFacts
        Money.parseKesToCents(hero.totalOut)?.let { return it }
        return fromFacts ?: hero.tally.sumOf { it.cents }
    }

    /**
     * When the tally rows are the top categories rather than the whole period (monthly reports), the column would not
     * add up to the total under the double rule. The difference becomes one "Everything else" row so the ledger adds
     * up; zero when the rows already make the total.
     */
    fun tallyRemainder(hero: Section.Hero, totalCents: Long): Long =
        (totalCents - hero.tally.sumOf { it.cents }).coerceAtLeast(0)

    fun tone(name: String?): MoneyTone = when (name) {
        "in" -> MoneyTone.In
        "out" -> MoneyTone.Out
        "fee" -> MoneyTone.Fee
        "transfer" -> MoneyTone.Transfer
        else -> MoneyTone.Neutral
    }

    /**
     * Relative column widths for a table section, from the longest text in each column (header included), so
     * `KSh 14,450` keeps one line at 360 dp. The first, text column gets a floor so names do not collapse.
     */
    fun columnWeights(table: Section.Table): List<Float> =
        table.columns.indices.map { c ->
            val longest = (listOf(table.columns[c]) + table.rows.mapNotNull { it.getOrNull(c) } + listOfNotNull(table.totalRow?.getOrNull(c)))
                .maxOf { it.length }
            val numeric = c in table.numericColumns
            longest.coerceIn(if (numeric) 4 else 8, if (numeric) 14 else 22).toFloat()
        }

    /** TalkBack reads `KSh 12,450` as letters; a plain amount string gets its spoken form, anything else is null. */
    fun spokenAmount(value: String): String? =
        Regex("""^KSh ([+-]?[\d,]+(?:\.\d{1,2})?)$""").matchEntire(value.trim())?.groupValues?.get(1)
}
