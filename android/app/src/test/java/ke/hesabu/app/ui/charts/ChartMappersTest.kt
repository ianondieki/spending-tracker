package ke.hesabu.app.ui.charts

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The tolerant mappers from FactsSheet JSON to chart data, for both the catalogue shape and the facts shapes. */
class ChartMappersTest {

    private fun json(s: String): JsonElement = Json.parseToJsonElement(s)

    // donut ---------------------------------------------------------------------------------------------------

    @Test
    fun donutReadsCategoryFactsSortsAndComputesShares() {
        val facts = json(
            """{"categories": [
                {"category_id": "transport", "name_en": "Transport", "name_sw": "Usafiri", "out": {"cents": 30000, "display": "KSh 300"}},
                {"category_id": "groceries", "name_en": "Groceries", "name_sw": "Mboga na vyakula", "out": {"cents": 70000, "display": "KSh 700"}}
            ]}""",
        )
        val d = ChartMappers.donut(facts, "/categories", "en", "Other")!!
        assertEquals(listOf("Groceries", "Transport"), d.slices.map { it.name })
        assertEquals(listOf(70, 30), d.slices.map { it.sharePct })
        assertEquals(listOf(0, 1), d.slices.map { it.slot })
        assertEquals(100_000L, d.totalCents)
        assertEquals("Mboga na vyakula", ChartMappers.donut(facts, "/categories", "sw", "Nyingine")!!.slices[0].name)
    }

    @Test
    fun donutFoldsTheTailAndAnExplicitOtherIntoOneOtherSlice() {
        val entries = (1..8).joinToString(",") { """{"name": "C$it", "cents": ${1000 * (10 - it)}}""" } +
            """,{"category_id": "other", "name_en": "Other", "out": {"cents": 500}}"""
        val d = ChartMappers.donut(json("""{"categories": [$entries]}"""), "/categories", "en", "Other")!!
        assertEquals(ChartMappers.MAX_DONUT_SLICES, d.slices.size)
        assertEquals(listOf("C1", "C2", "C3", "C4", "C5", "Other"), d.slices.map { it.name })
        // C6 + C7 + C8 + the explicit Other.
        assertEquals(4000L + 3000 + 2000 + 500, d.slices.last().cents)
        assertTrue(d.slices.last().isOther)
        assertEquals(d.totalCents, d.slices.sumOf { it.cents })
    }

    @Test
    fun donutKeepsSixSlicesWithoutOtherWhenThereAreExactlySix() {
        val entries = (1..6).joinToString(",") { """{"name": "C$it", "cents": ${100 * it}}""" }
        val d = ChartMappers.donut(json("""{"c": [$entries]}"""), "/c", "en", "Other")!!
        assertEquals(6, d.slices.size)
        assertFalse(d.slices.any { it.isOther })
    }

    @Test
    fun donutHonoursAColourSlotFromTheCatalogueShape() {
        val facts = json(
            """{"c": [
                {"name": "A", "cents": 900, "display": "KSh 9", "color": "#1F4FD8"},
                {"name": "B", "cents": 100, "display": "KSh 1"}
            ]}""",
        )
        val d = ChartMappers.donut(facts, "/c", "en", "Other")!!
        assertEquals(1, d.slices[0].slot)
        assertEquals(0, d.slices[1].slot)
    }

    @Test
    fun donutSkipsMalformedEntriesAndReturnsNullWhenNothingIsLeft() {
        val facts = json("""{"c": [1, "x", {"name": "A"}, {"cents": 5}, {"name": "Z", "cents": -10}, {"name": "B", "cents": "250"}]}""")
        val d = ChartMappers.donut(facts, "/c", "en", "Other")!!
        assertEquals(listOf("B"), d.slices.map { it.name })
        assertNull(ChartMappers.donut(json("""{"c": [{"name": "A", "cents": 0}]}"""), "/c", "en", "Other"))
        assertNull(ChartMappers.donut(json("""{"c": {"name": "A"}}"""), "/c", "en", "Other"))
        assertNull(ChartMappers.donut(json("""{}"""), "/categories", "en", "Other"))
        assertNull(ChartMappers.donut(null, "/categories", "en", "Other"))
    }

    // daily_bars ------------------------------------------------------------------------------------------------

    private val week = json(
        """{
          "daily": [
            {"date": "2026-10-05", "weekday_en": "Monday", "weekday_sw": "Jumatatu", "out": {"cents": 100000}},
            {"date": "2026-10-06", "weekday_en": "Tuesday", "weekday_sw": "Jumanne", "out": {"cents": 0}},
            {"date": "2026-10-07", "weekday_en": "Wednesday", "weekday_sw": "Jumatano", "out": {"cents": 300000}}
          ],
          "average_daily_out": {"cents": 133333, "display": "KSh 1,333"}
        }""",
    )

    @Test
    fun dailyBarsReadsDaysAverageAndSpendiestDay() {
        val d = ChartMappers.dailyBars(week, "/daily", "en")!!
        assertEquals(listOf("Monday", "Tuesday", "Wednesday"), d.bars.map { it.label })
        assertEquals(listOf("Mon", "Tue", "Wed"), d.bars.map { it.axisLabel })
        assertEquals(133_333L, d.averageCents)
        assertEquals(2, d.spendiestIndex)
    }

    @Test
    fun dailyBarsInKiswahiliUsesTheDayOfMonthUnderTheBars() {
        val d = ChartMappers.dailyBars(week, "/daily", "sw")!!
        assertEquals(listOf("Jumatatu", "Jumanne", "Jumatano"), d.bars.map { it.label })
        assertEquals(listOf("5", "6", "7"), d.bars.map { it.axisLabel })
    }

    @Test
    fun dailyBarsComputesTheAverageWhenTheSheetHasNoneAndLabelsEverySeventhDayInAMonth() {
        val days = (1..31).joinToString(",") { """{"date": "2026-10-${"%02d".format(it)}", "cents": ${it * 100}}""" }
        val d = ChartMappers.dailyBars(json("""{"daily": [$days]}"""), "/daily", "en")!!
        assertEquals(31, d.bars.size)
        assertEquals(listOf("1", "8", "15", "22", "29"), d.bars.map { it.axisLabel }.filter { it.isNotEmpty() })
        // (100 + ... + 3100) / 31 = 1600 cents exactly.
        assertEquals(1_600L, d.averageCents)
        assertEquals(30, d.spendiestIndex)
    }

    @Test
    fun dailyBarsWithNoSpendingHasNoSpendiestDay() {
        val d = ChartMappers.dailyBars(json("""{"daily": [{"label": "Mon", "cents": 0}]}"""), "/daily", "en")!!
        assertNull(d.spendiestIndex)
        assertEquals(0L, d.averageCents)
        assertNull(ChartMappers.dailyBars(json("""{"daily": []}"""), "/daily", "en"))
    }

    // top_bars --------------------------------------------------------------------------------------------------

    @Test
    fun topBarsSortsKeepsEightAndMarksNewNames() {
        val merchants = (1..10).joinToString(",") { """{"name": "M$it", "out": {"cents": ${it * 1000}}, "is_new": ${it == 9}}""" }
        val d = ChartMappers.topBars(json("""{"merchants": [$merchants]}"""), "/merchants", "en")!!
        assertEquals(ChartMappers.MAX_TOP_BARS, d.items.size)
        assertEquals("M10", d.items.first().name)
        assertEquals("M3", d.items.last().name)
        assertEquals(listOf("M9"), d.items.filter { it.isNew }.map { it.name })
    }

    @Test
    fun topBarsReadsPeopleBySentAmount() {
        val facts = json(
            """{"people": [
                {"name": "Grace A.", "sent": {"cents": 0}, "received": {"cents": 400000}},
                {"name": "Brian O.", "sent": {"cents": 150000}, "received": {"cents": 0}}
            ]}""",
        )
        val d = ChartMappers.topBars(facts, "/people", "en")!!
        assertEquals(listOf("Brian O."), d.items.map { it.name })
    }

    // fee_meter -------------------------------------------------------------------------------------------------

    @Test
    fun feeMeterUsesTheExactRatioForTheBarAndTheSheetPercentForTheLabel() {
        val facts = json(
            """{"totals": {"fees": {"cents": 18700, "display": "KSh 187"}, "out": {"cents": 1445000},
                "fee_ratio": {"value": 1, "display": "1%"}}}""",
        )
        val d = ChartMappers.feeMeter(facts, "/totals/fees")!!
        assertEquals(18_700L, d.feesCents)
        assertEquals(1, d.ratioPct)
        assertEquals(18_700.0 / 1_445_000.0, d.ratio!!, 1e-9)
        // Pointing at the totals object itself works too.
        assertEquals(d, ChartMappers.feeMeter(facts, "/totals"))
    }

    @Test
    fun feeMeterWithoutOutOrRatioStillShowsTheFees() {
        val d = ChartMappers.feeMeter(json("""{"totals": {"fees": 5000}}"""), "/totals/fees")!!
        assertEquals(5_000L, d.feesCents)
        assertNull(d.ratio)
        assertNull(d.ratioPct)
        assertNull(ChartMappers.feeMeter(json("""{"totals": {"fees": "lots"}}"""), "/totals/fees"))
    }

    @Test
    fun feeScaleIsTenPercentUnlessTheRatioIsBigger() {
        assertEquals(10, feeScaleMaxPct(0.0129))
        assertEquals(10, feeScaleMaxPct(0.10))
        assertEquals(15, feeScaleMaxPct(0.12))
        assertEquals(100, feeScaleMaxPct(3.0))
    }

    // balance_sparkline -----------------------------------------------------------------------------------------

    @Test
    fun sparklineReadsAnAccountSeriesAndItsLabel() {
        val facts = json(
            """{"accounts": [{"label": "M-Pesa 0712***678", "balance_series": [
                {"at": "2026-10-04T21:00:00Z", "cents": 785200}, {"at": "2026-10-05T20:59:00Z", "cents": 661200},
                {"at": "2026-10-06T20:59:00Z", "cents": 975200}
            ]}]}""",
        )
        val d = ChartMappers.sparkline(facts, "/accounts/0/balance_series")!!
        assertEquals("M-Pesa 0712***678", d.accountLabel)
        assertEquals(3, d.points.size)
        assertEquals(975_200L, d.last.cents)
        assertEquals(661_200L, d.minCents)
        assertEquals(d, ChartMappers.sparkline(facts, "/accounts/0"))
        assertNull(ChartMappers.sparkline(json("""{"s": [{"at": "t", "cents": 1}]}"""), "/s"))
    }

    // dispatch --------------------------------------------------------------------------------------------------

    @Test
    fun unknownChartTypesMapToNull() {
        assertNull(ChartMappers.map("waterfall", week, "/daily", "en", "Other"))
        assertTrue(ChartMappers.map("daily_bars", week, "/daily", "en", "Other") is DailyBarsData)
    }

    @Test
    fun percentRoundsHalfUp() {
        assertEquals(32, ChartMappers.percentHalfUp(4630, 14450))
        assertEquals(50, ChartMappers.percentHalfUp(1, 2))
        assertEquals(1, ChartMappers.percentHalfUp(1, 200))
        assertEquals(0, ChartMappers.percentHalfUp(1, 0))
    }
}
