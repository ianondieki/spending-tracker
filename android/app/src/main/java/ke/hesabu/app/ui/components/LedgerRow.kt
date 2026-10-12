package ke.hesabu.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone

/**
 * One line of the ruled ledger: a label (with an optional second line) on the left, an amount right-aligned in the
 * numeral column, a hairline rule underneath. 48 dp minimum height so it is a comfortable touch target when tappable.
 */
@Composable
fun LedgerRow(
    label: String,
    cents: Long,
    modifier: Modifier = Modifier,
    tone: MoneyTone = MoneyTone.Neutral,
    secondary: String? = null,
    trailing: String? = null,
    onClick: (() -> Unit)? = null,
    showRule: Boolean = true,
    decimals: Int = 0,
    horizontalPadding: Dp = 0.dp,
    leading: (@Composable RowScope.() -> Unit)? = null,
) {
    LedgerRow(
        label = label,
        modifier = modifier,
        secondary = secondary,
        onClick = onClick,
        showRule = showRule,
        horizontalPadding = horizontalPadding,
        leading = leading,
    ) {
        Column(horizontalAlignment = Alignment.End) {
            MoneyText(cents = cents, tone = tone, decimals = decimals)
            if (trailing != null) {
                Text(
                    trailing,
                    style = MaterialTheme.typography.bodySmall,
                    color = HesabuTheme.colors.inkSoft,
                    maxLines = 1,
                )
            }
        }
    }
}

/** The general form: any right-hand content (a balance with a date, a count, a chevron). */
@Composable
fun LedgerRow(
    label: String,
    modifier: Modifier = Modifier,
    secondary: String? = null,
    onClick: (() -> Unit)? = null,
    showRule: Boolean = true,
    horizontalPadding: Dp = 0.dp,
    leading: (@Composable RowScope.() -> Unit)? = null,
    value: @Composable () -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick, role = Role.Button) else Modifier),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .padding(horizontal = horizontalPadding, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (leading != null) leading()
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = HesabuTheme.colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (secondary != null) {
                    Text(
                        secondary,
                        style = MaterialTheme.typography.bodySmall,
                        color = HesabuTheme.colors.inkSoft,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(4.dp))
            value()
        }
        if (showRule) Rule(Modifier.padding(horizontal = horizontalPadding))
    }
}
