package ke.hesabu.app.ui.charts

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import ke.hesabu.app.ui.components.DoubleRule
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.tabular

/*
 * Pieces shared by the "Show as table" views: a total under the bookkeeper's double rule, and a ledger row whose
 * right-hand value is a plain figure (a percentage) rather than an amount.
 */

/** The total line of a chart's table: a double rule, then the label and the amount in the emphasis numeral size. */
@Composable
fun TableTotal(label: String, cents: Long, tone: MoneyTone = MoneyTone.Out) {
    Spacer(Modifier.height(8.dp))
    DoubleRule()
    LedgerRow(label = label, showRule = false) {
        MoneyText(cents = cents, tone = tone, style = HesabuTheme.money.emphasis)
    }
}

/** A ledger row whose value is text in tabular figures (a percentage, a count). */
@Composable
fun FigureRow(label: String, figure: String, secondary: String? = null, showRule: Boolean = true) {
    LedgerRow(label = label, secondary = secondary, showRule = showRule) {
        Text(figure, style = MaterialTheme.typography.bodyLarge.tabular(), color = HesabuTheme.colors.ink)
    }
}
