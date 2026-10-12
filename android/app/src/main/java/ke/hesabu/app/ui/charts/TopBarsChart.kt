package ke.hesabu.app.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import kotlin.math.min

/**
 * `top_bars` from contracts/chart-spec.md: the places (or people) paid most, largest first, at most eight. Laid out
 * as ledger lines: the name left, the amount right-aligned in the numeral column, and a horizontal bar beneath
 * that grows from the left edge with a 4 dp rounded data end. One series, one colour. New names carry a small dot
 * and the word "New", so the mark never rests on colour alone.
 */
@Composable
fun TopBarsChart(data: TopBarsData, modifier: Modifier = Modifier) {
    val colors = HesabuTheme.colors
    val max = data.items.maxOf { it.cents }.coerceAtLeast(1L)
    val newLabel = stringResource(R.string.chart_new)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        data.items.forEach { item ->
            Column(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            item.name,
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (item.isNew) {
                            Box(Modifier.padding(start = 8.dp).size(8.dp).background(colors.categorical[1], CircleShape))
                            Text(
                                newLabel,
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.inkSoft,
                                modifier = Modifier.padding(start = 4.dp),
                            )
                        }
                    }
                    MoneyText(cents = item.cents, tone = MoneyTone.Out, style = HesabuTheme.money.small, modifier = Modifier.padding(start = 12.dp))
                }
                val fraction = item.cents.toFloat() / max
                Canvas(Modifier.fillMaxWidth().padding(top = 6.dp).height(10.dp)) {
                    val w = (size.width * fraction).coerceAtLeast(2.dp.toPx())
                    val r = min(4.dp.toPx(), w / 2)
                    val bar = Path().apply {
                        addRoundRect(
                            RoundRect(
                                left = 0f, top = 0f, right = w, bottom = size.height,
                                topLeftCornerRadius = CornerRadius.Zero, bottomLeftCornerRadius = CornerRadius.Zero,
                                topRightCornerRadius = CornerRadius(r), bottomRightCornerRadius = CornerRadius(r),
                            ),
                        )
                    }
                    drawPath(bar, colors.categorical[0])
                }
            }
        }
    }
}

/** The ranking as ledger rows; new names say so in the second line. */
@Composable
fun TopBarsTable(data: TopBarsData) {
    val newLabel = stringResource(R.string.chart_new)
    data.items.forEachIndexed { i, item ->
        LedgerRow(
            label = item.name,
            cents = item.cents,
            tone = MoneyTone.Out,
            secondary = if (item.isNew) newLabel else null,
            showRule = i < data.items.lastIndex,
        )
    }
}
