package ke.hesabu.app.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.tabular
import kotlin.math.ceil

/**
 * `fee_meter` from contracts/chart-spec.md: a short ruled bar, not a gauge. The fees figure in the fee colour beside
 * its share of spending, then a track in the rule colour scaled 0 to 10 % (or the next 5 % above a bigger ratio),
 * ruled at every step of its empty part, with the fee share filled in `fee`. The exact ratio sizes the fill; the
 * label keeps the sheet's whole percent.
 */
@Composable
fun FeeMeter(data: FeeMeterData, modifier: Modifier = Modifier) {
    val colors = HesabuTheme.colors
    val ratio = (data.ratio ?: 0.0).coerceAtLeast(0.0)
    val scaleMaxPct = feeScaleMaxPct(ratio)
    val step = if (scaleMaxPct <= 10) 1 else 5
    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f).padding(bottom = 2.dp)) {
                Text(stringResource(R.string.chart_fees), style = MaterialTheme.typography.bodyMedium, color = colors.ink)
                if (data.ratioPct != null) {
                    Text(
                        stringResource(R.string.chart_fee_ratio, "${data.ratioPct}%"),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.inkSoft,
                    )
                }
            }
            MoneyText(cents = data.feesCents, tone = MoneyTone.Fee, style = HesabuTheme.money.emphasis)
        }
        Canvas(Modifier.fillMaxWidth().padding(top = 12.dp).height(12.dp)) {
            val radius = CornerRadius(2.dp.toPx())
            drawRoundRect(colors.rule, size = size, cornerRadius = radius)
            val fill = (ratio * 100 / scaleMaxPct).toFloat().coerceIn(0f, 1f) * size.width
            if (fill > 0f) drawRoundRect(colors.fee, size = Size(fill.coerceAtLeast(2.dp.toPx()), size.height), cornerRadius = radius)
            // The ruling: a sheet-coloured hairline at every step of the empty track, so the bar reads as counted.
            var p = step
            while (p < scaleMaxPct) {
                val x = size.width * p / scaleMaxPct
                if (x > fill + 1.dp.toPx()) drawLine(colors.sheet, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1.dp.toPx())
                p += step
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Text("0%", style = MaterialTheme.typography.bodySmall.tabular(), color = colors.inkSoft, modifier = Modifier.weight(1f))
            Text("$scaleMaxPct%", style = MaterialTheme.typography.bodySmall.tabular(), color = colors.inkSoft)
        }
    }
}

/** The fee figures as two ledger rows. */
@Composable
fun FeeMeterTable(data: FeeMeterData) {
    LedgerRow(label = stringResource(R.string.chart_fees), cents = data.feesCents, tone = MoneyTone.Fee, showRule = data.ratioPct != null)
    if (data.ratioPct != null) {
        FigureRow(label = stringResource(R.string.chart_fee_share), figure = "${data.ratioPct}%", showRule = false)
    }
}

/** 10 % covers almost every week; a bigger ratio widens the scale to the next multiple of 5, at most 100. */
internal fun feeScaleMaxPct(ratio: Double): Int {
    val pct = ratio * 100
    return if (pct <= 10.0) 10 else (ceil(pct / 5.0).toInt() * 5).coerceAtMost(100)
}
