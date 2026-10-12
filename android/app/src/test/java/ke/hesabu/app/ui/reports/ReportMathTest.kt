package ke.hesabu.app.ui.reports

import ke.hesabu.app.reports.Section
import ke.hesabu.app.reports.TallyItem
import ke.hesabu.app.ui.theme.MoneyTone
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

/** The renderer's small rules: hero totals, the tally remainder, tones, table widths, and period labels. */
class ReportMathTest {

    private fun hero(total: String, vararg rows: Pair<String, Long>) =
        Section.Hero(total, "KSh +100", "up", "verdict", rows.map { TallyItem(it.first, "", it.second) })

    @Test
    fun heroTotalPrefersFactsThatMatchTheDocument() {
        val facts = Json.parseToJsonElement("""{"totals": {"out": {"cents": 1445049, "display": "KSh 14,450"}}}""").jsonObject
        assertEquals(1_445_049L, ReportMath.heroTotalCents(hero("KSh 14,450"), facts))
    }

    @Test
    fun heroTotalFallsBackToTheDocumentWhenFactsDisagreeOrAreMissing() {
        val other = Json.parseToJsonElement("""{"totals": {"out": {"cents": 999900}}}""").jsonObject
        assertEquals(1_445_000L, ReportMath.heroTotalCents(hero("KSh 14,450"), other))
        assertEquals(1_445_000L, ReportMath.heroTotalCents(hero("KSh 14,450"), null))
        assertEquals(300L, ReportMath.heroTotalCents(hero("about a lot", "a" to 100L, "b" to 200L), null))
    }

    @Test
    fun monthlyTallyGetsAnEverythingElseRowSoTheColumnAddsUp() {
        val h = hero("KSh 1,000", "Rent" to 60_000L, "Food" to 25_000L)
        assertEquals(15_000L, ReportMath.tallyRemainder(h, 100_000L))
        assertEquals(0L, ReportMath.tallyRemainder(h, 80_000L))
    }

    @Test
    fun tonesMapToMoneyTones() {
        assertEquals(MoneyTone.In, ReportMath.tone("in"))
        assertEquals(MoneyTone.Out, ReportMath.tone("out"))
        assertEquals(MoneyTone.Fee, ReportMath.tone("fee"))
        assertEquals(MoneyTone.Transfer, ReportMath.tone("transfer"))
        assertEquals(MoneyTone.Neutral, ReportMath.tone("neutral"))
        assertEquals(MoneyTone.Neutral, ReportMath.tone(null))
    }

    @Test
    fun tableColumnsAreSizedByTheirLongestCell() {
        val t = Section.Table(
            title = "t", columns = listOf("Category", "Spent", "Share"),
            rows = listOf(listOf("Airtime and data", "KSh 1,500", "10%")),
            numericColumns = listOf(1, 2), totalRow = listOf("Total", "KSh 14,450", ""),
        )
        assertEquals(listOf(16f, 10f, 5f), ReportMath.columnWeights(t))
    }

    @Test
    fun spokenAmountOnlyForPlainAmounts() {
        assertEquals("14,450", ReportMath.spokenAmount("KSh 14,450"))
        assertEquals("+1,470", ReportMath.spokenAmount("KSh +1,470"))
        assertNull(ReportMath.spokenAmount("34"))
        assertNull(ReportMath.spokenAmount("KSh 1,200 and more"))
    }

    @Test
    fun periodLabelsInEnglishAndKiswahili() {
        val en = Locale.ENGLISH
        val range = { a: String, b: String -> "$a to $b" }
        // An exclusive end at Nairobi midnight ends the label the day before.
        assertEquals("5 to 11 October 2026", ReportFormat.periodLabel("weekly", "2026-10-04T21:00:00Z", "2026-10-11T21:00:00Z", en, range = range))
        assertEquals(
            "28 September to 4 October 2026",
            ReportFormat.periodLabel("weekly", "2026-09-27T21:00:00Z", "2026-10-04T21:00:00Z", en, range = range),
        )
        assertEquals(
            "28 Sep to 4 Oct 2026",
            ReportFormat.periodLabel("weekly", "2026-09-27T21:00:00Z", "2026-10-04T21:00:00Z", en, compact = true, range = range),
        )
        assertEquals(
            "5 to 11 October 2026",
            ReportFormat.periodLabel("weekly", "2026-10-04T21:00:00Z", "2026-10-11T21:00:00Z", en, compact = true, range = range),
        )
        assertEquals(
            "29 December 2025 to 4 January 2026",
            ReportFormat.periodLabel("weekly", "2025-12-29", "2026-01-04", en, range = range),
        )
        assertEquals("October 2026", ReportFormat.periodLabel("monthly", "2026-09-30T21:00:00Z", "2026-10-31T21:00:00Z", en, range = range))
        val sw = ReportFormat.periodLabel("weekly", "2026-10-04T21:00:00Z", "2026-10-11T21:00:00Z", Locale.forLanguageTag("sw")) { a, b -> "$a hadi $b" }
        assertTrue(sw, sw!!.startsWith("5 hadi 11 ") && sw.endsWith(" 2026"))
        assertNull(ReportFormat.periodLabel("weekly", "not a date", "", en, range = range))
    }

    @Test
    fun shortDateIsInNairobiTime() {
        // 22:30 UTC on the 11th is 01:30 on the 12th in Nairobi.
        assertEquals("12 Oct", ReportFormat.shortDate("2026-10-11T22:30:00Z", Locale.ENGLISH))
        assertNull(ReportFormat.shortDate(null, Locale.ENGLISH))
    }
}
