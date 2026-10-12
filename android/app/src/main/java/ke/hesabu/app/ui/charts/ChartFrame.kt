package ke.hesabu.app.ui.charts

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.QuietButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.theme.HesabuTheme

/**
 * The frame every report chart sits in: a ledger sheet with the title (which states the takeaway), an optional
 * second line, the chart, and a "Show as table" toggle that swaps the drawing for the same numbers as ledger rows.
 *
 * TalkBack reads the chart as one node whose description is the alt text plus the key numbers; the drawing's own
 * pieces are hidden from it so nothing is read twice. The table view is the full, row-by-row equivalent.
 */
@Composable
fun ChartFrame(
    title: String,
    takeaway: String?,
    description: String,
    modifier: Modifier = Modifier,
    stateKey: String = title,
    table: @Composable ColumnScope.() -> Unit,
    chart: @Composable ColumnScope.() -> Unit,
) {
    var showTable by rememberSaveable(stateKey) { mutableStateOf(false) }
    Sheet(modifier) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = HesabuTheme.colors.ink,
            modifier = Modifier.semantics { heading() },
        )
        if (!takeaway.isNullOrBlank()) {
            Text(
                takeaway,
                style = MaterialTheme.typography.bodyMedium,
                color = HesabuTheme.colors.inkSoft,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        Spacer(Modifier.height(16.dp))
        if (showTable) {
            Column(Modifier.fillMaxWidth(), content = table)
        } else {
            Column(
                Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description },
                content = chart,
            )
        }
        QuietButton(
            text = stringResource(if (showTable) R.string.chart_show_chart else R.string.chart_show_table),
            onClick = { showTable = !showTable },
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/** A chart whose data is missing or malformed: the title and one quiet line, never a crash or a blank box. */
@Composable
fun EmptyChart(title: String, modifier: Modifier = Modifier) {
    EmptyState(title = title, body = stringResource(R.string.chart_empty_body), modifier = modifier)
}

/** A chart type the app does not draw yet: the title, the takeaway and the alt text, which carries the numbers. */
@Composable
fun ChartAsText(title: String, takeaway: String?, altText: String, modifier: Modifier = Modifier) {
    Sheet(modifier) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = HesabuTheme.colors.ink, modifier = Modifier.semantics { heading() })
        if (!takeaway.isNullOrBlank()) {
            Text(takeaway, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 4.dp))
        }
        Text(altText, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink, modifier = Modifier.padding(top = 12.dp))
    }
}
