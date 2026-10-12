package ke.hesabu.app.ui.charts

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ke.hesabu.app.R
import ke.hesabu.app.parse.Money
import ke.hesabu.app.reports.Section
import kotlinx.serialization.json.JsonObject
import java.util.Locale

/**
 * Renders one `chart` section of a ReportDocument: maps the FactsSheet at the section's `data_ref` to chart data,
 * then draws it inside a [ChartFrame] with its accessible description and table twin. Chart types the app does not
 * draw yet fall back to their alt text (which carries the numbers); drawable types with unusable data show a quiet
 * empty state.
 */
@Composable
fun ReportChart(section: Section.Chart, facts: JsonObject?, locale: String, modifier: Modifier = Modifier) {
    val otherLabel = stringResource(R.string.chart_other)
    val data = remember(section, facts, locale, otherLabel) {
        runCatching { ChartMappers.map(section.chartType, facts, section.dataRef, locale, otherLabel) }.getOrNull()
    }
    when {
        data == null && section.chartType !in DRAWN_TYPES -> ChartAsText(section.title, section.takeaway, section.altText, modifier)
        data == null -> EmptyChart(section.title, modifier)
        else -> ChartFrame(
            title = section.title,
            takeaway = section.takeaway,
            description = chartDescription(section.altText, data),
            modifier = modifier,
            stateKey = section.chartId,
            table = { ChartTable(data, locale) },
            chart = { ChartBody(data) },
        )
    }
}

/** The chart types drawn natively in the app; the rest of the catalogue renders as text for now. */
val DRAWN_TYPES: Set<String> = setOf("donut", "daily_bars", "top_bars", "fee_meter", "balance_sparkline")

@Composable
private fun ChartBody(data: ChartData) = when (data) {
    is DonutData -> DonutChart(data)
    is DailyBarsData -> DailyBarsChart(data)
    is TopBarsData -> TopBarsChart(data)
    is FeeMeterData -> FeeMeter(data)
    is SparklineData -> BalanceSparkline(data)
}

@Composable
private fun ChartTable(data: ChartData, locale: String) = when (data) {
    is DonutData -> DonutTable(data)
    is DailyBarsData -> DailyBarsTable(data)
    is TopBarsData -> TopBarsTable(data)
    is FeeMeterData -> FeeMeterTable(data)
    is SparklineData -> BalanceTable(data, Locale.forLanguageTag(locale))
}

/** The alt text from the document, then the key numbers computed from the drawn data. */
@Composable
fun chartDescription(altText: String, data: ChartData): String {
    val keyNumbers = when (data) {
        is DonutData -> listOf(stringResource(R.string.chart_a11y_total, Money.formatKsh(data.totalCents))) +
            data.slices.map { stringResource(R.string.chart_a11y_slice, it.name, Money.formatKsh(it.cents), "${it.sharePct}%") }
        is DailyBarsData -> listOfNotNull(
            data.spendiestIndex?.let { i ->
                stringResource(R.string.chart_a11y_highest, data.bars[i].label, Money.formatKsh(data.bars[i].cents))
            },
            stringResource(R.string.chart_a11y_average, Money.formatKsh(data.averageCents)),
        )
        is TopBarsData -> data.items.map { stringResource(R.string.chart_a11y_item, it.name, Money.formatKsh(it.cents)) }
        is FeeMeterData -> listOf(
            if (data.ratioPct != null) {
                stringResource(R.string.chart_a11y_fees_ratio, Money.formatKsh(data.feesCents), "${data.ratioPct}%")
            } else {
                stringResource(R.string.chart_a11y_fees, Money.formatKsh(data.feesCents))
            },
        )
        is SparklineData -> listOf(
            stringResource(
                R.string.chart_a11y_balance,
                Money.formatKsh(data.last.cents),
                Money.formatKsh(data.minCents),
                Money.formatKsh(data.maxCents),
            ),
        )
    }
    return (listOf(altText.trim()) + keyNumbers).filter { it.isNotEmpty() }.joinToString(" ")
}
