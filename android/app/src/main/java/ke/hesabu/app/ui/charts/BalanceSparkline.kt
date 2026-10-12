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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * `balance_sparkline` from contracts/chart-spec.md: one account's balance through the period as a 2 dp line, the last
 * value labelled (right-aligned, above the line) and marked with an 8 dp dot ringed in the sheet colour. A ruled zero
 * line appears only when the balance crosses zero (an overdraft such as Fuliza).
 */
@Composable
fun BalanceSparkline(data: SparklineData, modifier: Modifier = Modifier) {
    val colors = HesabuTheme.colors
    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                data.accountLabel.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.inkSoft,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            MoneyText(cents = data.last.cents, tone = MoneyTone.Neutral, style = HesabuTheme.money.row)
        }
        Canvas(Modifier.fillMaxWidth().padding(top = 8.dp).height(64.dp)) {
            val inset = 6.dp.toPx()
            val lo = data.minCents
            val hi = data.maxCents
            val span = (hi - lo).coerceAtLeast(1L).toFloat()
            val n = data.points.size
            fun x(i: Int) = inset + (size.width - 2 * inset) * i / (n - 1)
            fun y(c: Long) = size.height - inset - (size.height - 2 * inset) * ((c - lo) / span)
            if (data.minCents < 0 && hi > 0) {
                drawLine(colors.rule, Offset(0f, y(0)), Offset(size.width, y(0)), strokeWidth = 1.dp.toPx())
            }
            val line = Path().apply {
                data.points.forEachIndexed { i, p -> if (i == 0) moveTo(x(i), y(p.cents)) else lineTo(x(i), y(p.cents)) }
            }
            drawPath(line, colors.categorical[0], style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            val end = Offset(x(n - 1), y(data.last.cents))
            drawCircle(colors.sheet, radius = 6.dp.toPx(), center = end)
            drawCircle(colors.categorical[0], radius = 4.dp.toPx(), center = end)
        }
    }
}

/** The balance points as ledger rows, oldest first, dated in Nairobi time. */
@Composable
fun BalanceTable(data: SparklineData, locale: Locale) {
    data.points.forEachIndexed { i, p ->
        LedgerRow(label = pointLabel(p.at, locale), cents = p.cents, tone = MoneyTone.Neutral, showRule = i < data.points.lastIndex)
    }
}

private val NAIROBI: ZoneId = ZoneId.of("Africa/Nairobi")

/** `Sat 10 Oct, 23:59` in the given locale; the raw string when the time does not parse. */
internal fun pointLabel(at: String, locale: Locale): String =
    runCatching {
        OffsetDateTime.parse(at).atZoneSameInstant(NAIROBI).format(DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", locale))
    }.getOrDefault(at)
