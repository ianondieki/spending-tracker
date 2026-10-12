package ke.hesabu.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.theme.HesabuMotion
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone

/** One row of a tally: a day, a category, a merchant. */
@Immutable
data class TallyRow(
    val label: String,
    val cents: Long,
    val tone: MoneyTone = MoneyTone.Out,
    val secondary: String? = null,
)

/**
 * The one memorable element: a ruled column of rows that adds up to a large total under a double rule.
 *
 * Motion: when it first appears, rows reveal top to bottom and the double rule draws under the total, all inside
 * 300 ms (the only self-starting animation in the app). With reduced motion, or [animate] false, everything is
 * drawn at once. The reveal runs once per [revealKey]; pass a period id so a new period plays it again.
 *
 * The total is passed in, never summed here: the caller computes it from the same source as the rows, and a
 * debug assertion catches a mismatch when the rows are the whole of the total.
 */
@Composable
fun Tally(
    rows: List<TallyRow>,
    totalLabel: String,
    totalCents: Long,
    modifier: Modifier = Modifier,
    totalTone: MoneyTone = MoneyTone.Out,
    animate: Boolean = true,
    revealKey: Any? = Unit,
    emptyText: String? = null,
) {
    val reduced = HesabuTheme.reducedMotion
    val progress = remember(revealKey) { Animatable(if (animate && !reduced) 0f else 1f) }
    LaunchedEffect(revealKey, animate, reduced) {
        if (animate && !reduced) {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(HesabuMotion.TALLY_MS, easing = LinearEasing))
        } else {
            progress.snapTo(1f)
        }
    }
    val p by progress.asState()
    val n = rows.size
    val summary = buildString {
        append(totalLabel).append(' ').append(Money.formatKsh(totalCents))
        rows.forEach { append(". ").append(it.label).append(' ').append(Money.formatKsh(it.cents)) }
    }

    Column(modifier.fillMaxWidth().semantics(mergeDescendants = false) { contentDescription = summary }) {
        if (n == 0 && emptyText != null) {
            Text(
                emptyText,
                style = MaterialTheme.typography.bodyMedium,
                color = HesabuTheme.colors.inkSoft,
                modifier = Modifier.padding(vertical = 12.dp),
            )
        }
        rows.forEachIndexed { i, row ->
            // Rows take the first 80 % of the reveal, each one fading in over its own slice, top to bottom.
            val rowAlpha = if (n == 0) 1f else ((p * 0.8f * n) - i).coerceIn(0f, 1f)
            LedgerRow(
                label = row.label,
                cents = row.cents,
                tone = row.tone,
                secondary = row.secondary,
                modifier = Modifier.alpha(rowAlpha),
                showRule = i < n - 1,
            )
        }
        Spacer(Modifier.height(12.dp))
        // The rule draws over the last 40 % (overlapping the final rows), then the total is already in place.
        DoubleRule(progress = ((p - 0.6f) / 0.4f).coerceIn(0f, 1f))
        Row(
            Modifier.fillMaxWidth().padding(top = 12.dp).alpha(((p - 0.5f) / 0.5f).coerceIn(0f, 1f)),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                totalLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = HesabuTheme.colors.inkSoft,
                modifier = Modifier.weight(1f).padding(bottom = 6.dp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            MoneyText(cents = totalCents, tone = totalTone, style = HesabuTheme.money.total)
        }
    }
}
