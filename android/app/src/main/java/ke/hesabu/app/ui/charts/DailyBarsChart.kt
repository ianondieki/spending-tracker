package ke.hesabu.app.ui.charts

import ke.hesabu.app.ui.components.tabularDigits
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.tabular
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * `daily_bars` from contracts/chart-spec.md: one column per day on ruled grid lines, the spendiest day emphasised in
 * ink with its amount on the cap and the other days one step softer (emphasis, not a value ramp), and the daily
 * average as a line in `average_line` with a keyed label underneath. Weekly: seven bars. Monthly: 28 to 31 bars
 * with every seventh labelled. Columns are at most 24 dp wide with a 4 dp rounded data end and a square base.
 */
@Composable
fun DailyBarsChart(data: DailyBarsData, modifier: Modifier = Modifier) {
    val colors = HesabuTheme.colors
    val measurer = rememberTextMeasurer()
    val tickStyle = MaterialTheme.typography.bodySmall.tabular().copy(color = colors.inkSoft)
    val axisStyle = MaterialTheme.typography.bodySmall.copy(color = colors.inkSoft)
    val capStyle = HesabuTheme.money.small.copy(color = colors.ink)
    // Emphasis, not a value ramp: the spendiest day in ink, the rest one light step back so the average line
    // (its own token) stays visible where it crosses them.
    val emphasis = colors.categorical[0]
    val soft = colors.categorical[4]
    val maxCents = max(data.bars.maxOf { it.cents }, data.averageCents)
    val ticks = ChartScale.ticks(maxCents)
    val top = ticks.last().coerceAtLeast(1L)
    val spendiest = data.spendiestIndex

    Column(modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(200.dp)) {
            val tickLayouts = ticks.map { measurer.measure(tabularDigits(ChartScale.compact(it)), tickStyle) }
            val axisWidth = tickLayouts.maxOf { it.size.width } + 8.dp.toPx()
            val xBand = 22.dp.toPx()
            val capBand = 22.dp.toPx()
            val plotLeft = axisWidth
            val plotRight = size.width
            val plotTop = capBand
            val plotBottom = size.height - xBand
            val plotHeight = plotBottom - plotTop
            fun y(cents: Long) = plotBottom - plotHeight * (cents.toFloat() / top)

            // Grid: the ruled line at each clean tick, labels right-aligned in the axis band. A grid line that would
            // sit on the average line is left out so the two never merge into one thick rule.
            val averageY = y(data.averageCents)
            ticks.forEachIndexed { i, t ->
                val gy = y(t)
                if (t == 0L || abs(gy - averageY) > 6.dp.toPx()) {
                    drawLine(colors.rule, Offset(plotLeft, gy), Offset(plotRight, gy), strokeWidth = 1.dp.toPx())
                }
                val l = tickLayouts[i]
                drawText(l, topLeft = Offset(axisWidth - 8.dp.toPx() - l.size.width, gy - l.size.height / 2f))
            }

            val n = data.bars.size
            val slot = (plotRight - plotLeft) / n
            val gap = 2.dp.toPx()
            val barWidth = min(24.dp.toPx(), max(slot * 0.62f, slot - gap)).coerceAtMost(slot - gap).coerceAtLeast(1f)
            val corner = min(4.dp.toPx(), barWidth / 2)
            data.bars.forEachIndexed { i, bar ->
                val cx = plotLeft + slot * (i + 0.5f)
                val left = cx - barWidth / 2
                if (bar.cents > 0) {
                    val barTop = y(bar.cents)
                    val path = Path().apply {
                        addRoundRect(
                            RoundRect(
                                left = left, top = barTop, right = left + barWidth, bottom = plotBottom,
                                topLeftCornerRadius = CornerRadius(corner), topRightCornerRadius = CornerRadius(corner),
                                bottomLeftCornerRadius = CornerRadius.Zero, bottomRightCornerRadius = CornerRadius.Zero,
                            ),
                        )
                    }
                    drawPath(path, if (i == spendiest) emphasis else soft)
                }
                if (bar.axisLabel.isNotEmpty()) {
                    val l = measurer.measure(bar.axisLabel, axisStyle)
                    drawText(l, topLeft = Offset(cx - l.size.width / 2f, plotBottom + 4.dp.toPx()))
                }
            }

            // The daily average, a reference line in its own token, drawn over the columns.
            drawLine(colors.averageLine, Offset(plotLeft, averageY), Offset(plotRight, averageY), strokeWidth = 1.5.dp.toPx())

            // The spendiest day's amount on its cap, kept inside the plot.
            if (spendiest != null) {
                val bar = data.bars[spendiest]
                val l = measurer.measure(tabularDigits(Money.formatKsh(bar.cents)), capStyle)
                val cx = plotLeft + slot * (spendiest + 0.5f)
                val x = (cx - l.size.width / 2f).coerceIn(plotLeft, plotRight - l.size.width)
                drawText(l, topLeft = Offset(x, y(bar.cents) - l.size.height - 4.dp.toPx()))
            }
        }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Canvas(Modifier.width(16.dp).height(8.dp)) {
                drawLine(colors.averageLine, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 1.5.dp.toPx())
            }
            Text(
                stringResource(R.string.chart_daily_average, Money.formatKsh(data.averageCents)),
                style = MaterialTheme.typography.bodySmall,
                color = colors.inkSoft,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

/** The days as ledger rows, the spendiest marked in words, then the average. */
@Composable
fun DailyBarsTable(data: DailyBarsData) {
    val spendiestLabel = stringResource(R.string.chart_spendiest)
    data.bars.forEachIndexed { i, bar ->
        LedgerRow(
            label = bar.label,
            cents = bar.cents,
            tone = MoneyTone.Out,
            secondary = if (i == data.spendiestIndex) spendiestLabel else null,
        )
    }
    LedgerRow(label = stringResource(R.string.chart_daily_average_row), showRule = false) {
        MoneyText(cents = data.averageCents, tone = MoneyTone.Neutral, color = HesabuTheme.colors.inkSoft)
    }
}
