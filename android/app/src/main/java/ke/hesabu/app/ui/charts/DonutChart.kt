package ke.hesabu.app.ui.charts

import ke.hesabu.app.ui.components.tabularDigits
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.theme.HesabuColors
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.tabular
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * `donut` from contracts/chart-spec.md: spending by category, at most six slices with Other last in `other_slice`.
 * The centre shows the total out; the largest slice is labelled outside with a hairline leader; a 2 dp sheet-coloured
 * gap separates the slices (never a stroke). Six series, so a swatch legend sits underneath; text stays in ink.
 */
@Composable
fun DonutChart(data: DonutData, modifier: Modifier = Modifier) {
    val colors = HesabuTheme.colors
    val measurer = rememberTextMeasurer()
    val nameStyle = MaterialTheme.typography.bodyMedium.copy(color = colors.ink)
    val valueStyle = HesabuTheme.money.small.copy(color = colors.inkSoft)
    val centreLabelStyle = MaterialTheme.typography.bodySmall.copy(color = colors.inkSoft)
    val centreBig = HesabuTheme.money.emphasis.copy(color = colors.ink)
    val centreSmall = HesabuTheme.money.small.copy(color = colors.ink, fontWeight = centreBig.fontWeight)
    val centreLabel = stringResource(R.string.chart_centre_spent)
    val total = Money.formatKsh(data.totalCents)
    val top = data.slices.firstOrNull()?.takeIf { !it.isOther }

    Column(modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(196.dp)) {
            val pad = 4.dp.toPx()
            val diameter = min(size.height - 2 * pad, size.width * 0.52f)
            val radius = diameter / 2
            val centre = Offset(pad + radius, size.height / 2)
            val ring = diameter * 0.17f
            val arcSize = Size(diameter - ring, diameter - ring)
            val arcTopLeft = Offset(centre.x - arcSize.width / 2, centre.y - arcSize.height / 2)
            val midRadius = (diameter - ring) / 2
            val gapDegrees = if (data.slices.size > 1) (2.dp.toPx() / midRadius * 180f / PI.toFloat()) else 0f

            var start = -90f
            var topMid = -90f
            data.slices.forEachIndexed { i, slice ->
                val sweep = 360f * slice.cents / data.totalCents
                if (i == 0) topMid = start + sweep / 2
                val drawn = sweep - gapDegrees
                if (drawn > 0f) {
                    drawArc(
                        color = sliceColor(colors, slice),
                        startAngle = start + gapDegrees / 2,
                        sweepAngle = drawn,
                        useCenter = false,
                        topLeft = arcTopLeft,
                        size = arcSize,
                        style = Stroke(width = ring, cap = StrokeCap.Butt),
                    )
                }
                start += sweep
            }

            // Centre: the total out, shrunk to the small numeral size when it would not clear the hole.
            val hole = diameter - 2 * ring
            val bigLayout = measurer.measure(tabularDigits(total), centreBig)
            val valueLayout = if (bigLayout.size.width <= hole * 0.9f) bigLayout else measurer.measure(tabularDigits(total), centreSmall)
            val labelLayout = measurer.measure(centreLabel, centreLabelStyle)
            val blockHeight = labelLayout.size.height + valueLayout.size.height
            drawText(labelLayout, topLeft = Offset(centre.x - labelLayout.size.width / 2f, centre.y - blockHeight / 2f))
            drawText(
                valueLayout,
                topLeft = Offset(centre.x - valueLayout.size.width / 2f, centre.y - blockHeight / 2f + labelLayout.size.height),
            )

            // The largest slice, labelled outside with a hairline leader to the right of the ring.
            if (top != null) {
                val angle = topMid * PI.toFloat() / 180f
                val anchor = Offset(centre.x + (radius + 4.dp.toPx()) * cos(angle), centre.y + (radius + 4.dp.toPx()) * sin(angle))
                val elbowX = centre.x + radius + 16.dp.toPx()
                val textX = elbowX + 6.dp.toPx()
                val maxWidth = (size.width - textX).toInt()
                if (maxWidth > 24.dp.toPx()) {
                    val nameLayout = measurer.measure(
                        top.name, nameStyle, overflow = TextOverflow.Ellipsis, maxLines = 2,
                        constraints = Constraints(maxWidth = maxWidth),
                    )
                    val amountLayout = measurer.measure(
                        tabularDigits("${Money.formatKsh(top.cents)}, ${top.sharePct}%"), valueStyle, overflow = TextOverflow.Ellipsis, maxLines = 1,
                        constraints = Constraints(maxWidth = maxWidth),
                    )
                    val textHeight = nameLayout.size.height + amountLayout.size.height
                    val textTop = (anchor.y - textHeight / 2f).coerceIn(0f, size.height - textHeight)
                    drawLine(colors.inkSoft, anchor, Offset(elbowX, anchor.y), strokeWidth = 1.dp.toPx())
                    drawText(nameLayout, topLeft = Offset(textX, textTop))
                    drawText(amountLayout, topLeft = Offset(textX, textTop + nameLayout.size.height))
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        DonutLegend(data)
    }
}

/** Six series: a legend of swatches and names in two columns, so identity never rests on colour alone. */
@Composable
private fun DonutLegend(data: DonutData) {
    val colors = HesabuTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        data.slices.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { slice ->
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        Swatch(sliceColor(colors, slice))
                        Text(
                            slice.name,
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = 8.dp).weight(1f, fill = false),
                        )
                        Text(
                            "${slice.sharePct}%",
                            style = MaterialTheme.typography.bodySmall.tabular(),
                            color = colors.inkSoft,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** The donut's numbers as ledger rows, each with its swatch, and the total under a double rule. */
@Composable
fun DonutTable(data: DonutData) {
    val colors = HesabuTheme.colors
    data.slices.forEach { slice ->
        LedgerRow(
            label = slice.name,
            cents = slice.cents,
            tone = MoneyTone.Out,
            secondary = "${slice.sharePct}%",
            leading = { Swatch(sliceColor(colors, slice)) },
        )
    }
    TableTotal(label = stringResource(R.string.chart_total), cents = data.totalCents)
}

@Composable
internal fun Swatch(color: Color, modifier: Modifier = Modifier) {
    Box(modifier.size(10.dp).background(color, RoundedCornerShape(2.dp)))
}

internal fun sliceColor(colors: HesabuColors, slice: DonutSlice): Color =
    slice.slot?.let { colors.categorical.getOrNull(it) } ?: colors.otherSlice
