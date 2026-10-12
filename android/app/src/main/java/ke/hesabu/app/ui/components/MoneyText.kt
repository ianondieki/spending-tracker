package ke.hesabu.app.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import ke.hesabu.app.R
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.TABULAR_NUMERALS
import ke.hesabu.app.ui.theme.forTone

/**
 * An amount, written the way the design tokens say: `KSh 12,450`, tabular numerals, right-aligned so every amount
 * in a column shares one numeral column, coloured by meaning (in, out, fee, transfer). Spending is ink, not red.
 *
 * TalkBack reads "12,450 shillings" rather than spelling out "K S h".
 *
 * Tabular figures are applied to digit runs only: with `tnum` on the whole string Schibsted Grotesk also widens the
 * thousands comma to a digit slot, which reads as "3 , 420". Digits stay in one column; separators keep their width.
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
        text = tabularDigits(Money.formatKsh(cents, decimals)),
        modifier = modifier.semantics { contentDescription = label },
        style = style,
        color = if (color == Color.Unspecified) HesabuTheme.colors.forTone(tone) else color,
        textAlign = textAlign,
        maxLines = maxLines,
        softWrap = false,
    )
}

/** Digit runs get `tnum`; everything else (symbol, comma, point, space) keeps its natural width. */
fun tabularDigits(text: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val digit = text[i].isDigit()
        var j = i
        while (j < text.length && text[j].isDigit() == digit) j++
        if (digit) withStyle(SpanStyle(fontFeatureSettings = TABULAR_NUMERALS)) { append(text, i, j) } else append(text, i, j)
        i = j
    }
}
