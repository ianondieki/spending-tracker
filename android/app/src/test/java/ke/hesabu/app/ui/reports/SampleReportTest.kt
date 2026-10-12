package ke.hesabu.app.ui.reports

import ke.hesabu.app.parse.Money
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.ReportJson
import ke.hesabu.app.reports.Section
import ke.hesabu.app.ui.charts.ChartMappers
import ke.hesabu.app.ui.charts.DRAWN_TYPES
import ke.hesabu.app.ui.charts.JsonPointer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The bundled sample report: it deserialises through ReportJson, its hero tally adds up to the total exactly, and
 * every amount and percentage in its copy is a display string from its own FactsSheet (numbers are computed, never
 * generated). This is the fact-checker's rule, applied to the sample.
 */
class SampleReportTest {

    private val detail = SampleReport.detail
    private val document = requireNotNull(detail.document)
    private val facts = requireNotNull(detail.facts)

    @Test
    fun deserialisesThroughReportJson() {
        assertEquals("sample-weekly-2026-10-05", detail.summary.reportId)
        assertEquals(detail.summary.reportId, document.reportId)
        assertEquals("weekly", document.kind)
        assertEquals("done", detail.summary.status)
        // One of every section type the app renders.
        val types = document.sections.map { it::class }.toSet()
        listOf(
            Section.Hero::class, Section.Kpis::class, Section.Chart::class, Section.Insights::class, Section.Table::class,
            Section.ListSection::class, Section.Callout::class, Section.Watch::class, Section.Footer::class,
        ).forEach { assertTrue("missing $it", it in types) }
        // And it round-trips through the same serialiser without loss.
        val again = ReportJson.decodeFromString(
            ReportDetail.serializer(),
            ReportJson.encodeToString(ReportDetail.serializer(), detail),
        )
        assertEquals(detail.document, again.document)
    }

    @Test
    fun heroTallyHasSevenDaysSummingExactlyToTotalOut() {
        val hero = document.sections.filterIsInstance<Section.Hero>().single()
        assertEquals(7, hero.tally.size)
        val totalCents = facts["totals"]!!.jsonObject["out"]!!.jsonObject["cents"]!!.jsonPrimitive.long
        assertEquals(totalCents, hero.tally.sumOf { it.cents })
        assertEquals(Money.formatKsh(totalCents), hero.totalOut)
        hero.tally.forEach { assertEquals(Money.formatKsh(it.cents), it.value) }
        assertEquals(totalCents, ReportMath.heroTotalCents(hero, facts))
        assertEquals(0L, ReportMath.tallyRemainder(hero, totalCents))
    }

    @Test
    fun everyAmountAndPercentInTheCopyIsADisplayStringFromTheFacts() {
        val allowed = facts["display_strings"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet()
        val numbers = Regex("""KSh [+-]?\d{1,3}(?:,\d{3})*|-?\d+%""")
        val violations = copyStrings().flatMap { text -> numbers.findAll(text).map { it.value }.filter { it !in allowed }.map { "$it in \"$text\"" } }
        assertTrue("numbers not in the facts: $violations", violations.isEmpty())
    }

    @Test
    fun donutHasFiveCategoriesAndOtherAndEveryChartResolves() {
        document.sections.filterIsInstance<Section.Chart>().forEach { chart ->
            assertTrue("${chart.chartId} type", chart.chartType in DRAWN_TYPES)
            assertNotNull("${chart.chartId} data_ref", JsonPointer.resolve(facts, chart.dataRef))
            assertNotNull("${chart.chartId} maps", ChartMappers.map(chart.chartType, facts, chart.dataRef, document.locale, "Other"))
        }
        val donut = ChartMappers.donut(facts, "/categories", "en", "Other")!!
        assertEquals(6, donut.slices.size)
        assertTrue(donut.slices.last().isOther)
        assertEquals(5, donut.slices.count { !it.isOther })
        val daily = ChartMappers.dailyBars(facts, "/daily", "en")!!
        assertEquals(7, daily.bars.size)
        assertEquals("Saturday", daily.bars[daily.spendiestIndex!!].label)
    }

    @Test
    fun categoriesMerchantsAndDaysAgreeWithTheTotal() {
        val out = facts["totals"]!!.jsonObject["out"]!!.jsonObject["cents"]!!.jsonPrimitive.long
        fun sum(path: String, key: String) = (JsonPointer.resolve(facts, path) as JsonArray)
            .sumOf { it.jsonObject[key]!!.jsonObject["cents"]!!.jsonPrimitive.long }
        assertEquals(out, sum("/categories", "out"))
        assertEquals(out, sum("/merchants", "out"))
        assertEquals(out, sum("/daily", "out"))
    }

    /** All the words a person reads: title, every section's text, the WhatsApp caption and the email lines. */
    private fun copyStrings(): List<String> {
        val texts = mutableListOf(document.title, document.periodLabel)
        document.whatsapp?.let { texts += it.caption }
        document.email?.let { texts += listOf(it.subject, it.preheader) }
        document.sections.forEach { s ->
            when (s) {
                is Section.Hero -> texts += listOf(s.totalOut, s.delta, s.verdict) + s.tally.flatMap { listOf(it.label, it.value) }
                is Section.Kpis -> s.items.forEach { texts += listOfNotNull(it.label, it.value, it.delta) }
                is Section.Chart -> texts += listOfNotNull(s.title, s.takeaway, s.altText)
                is Section.Insights -> s.items.forEach { texts += listOf(it.headline, it.body) }
                is Section.Table -> texts += s.columns + s.rows.flatten() + s.totalRow.orEmpty()
                is Section.ListSection -> texts += listOf(s.title) + s.items
                is Section.Callout -> texts += s.body
                is Section.Watch -> texts += listOf(s.title) + s.items
                is Section.Footer -> texts += s.accountsCovered + listOf(s.computedNote, s.unknownCount)
            }
        }
        return texts.filterIsInstance<String>()
    }
}
