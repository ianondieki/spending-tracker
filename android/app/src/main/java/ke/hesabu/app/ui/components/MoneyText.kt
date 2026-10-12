package ke.hesabu.app.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import ke.hesabu.app.R
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.forTone

/**
 * An amount, written the way the design tokens say: `KSh 12,450`, tabular numerals, right-aligned so every amount
 * in a column shares one numeral column, coloured by meaning (in, out, fee, transfer). Spending is ink, not red.
 *
 * TalkBack reads "12,450 shillings" rather than spelling out "K S h".
 */
@Composable
fun MoneyText(
    cents: Long,
    modifier: Modifier = Modifier,
    tone: MoneyTone = MoneyTone.Neutral,
    style: TextStyle = HesabuTheme.money.row,
    decimals: Int = 0,
    color: Color = Color.Unspecified,
    textAlign: TextAlign = TextAlign.End,
    maxLines: Int = 1,
) {
    val plain = Money.formatPlain(cents, decimals)
    val label = stringResource(R.string.money_a11y, plain)
    Text(
        text = Money.formatKsh(cents, decimals),
        modifier = modifier.semantics { contentDescription = label },
        style = style,
        color = if (color == Color.Unspecified) HesabuTheme.colors.forTone(tone) else color,
        textAlign = textAlign,
        maxLines = maxLines,
        softWrap = false,
    )
}
