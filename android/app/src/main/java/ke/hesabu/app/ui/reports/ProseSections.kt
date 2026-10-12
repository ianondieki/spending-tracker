package ke.hesabu.app.ui.reports

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.reports.Section
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.theme.HesabuTheme

/*
 * The prose sections of a report. Prose has no rules at all (the rule means money is being counted), so these are
 * plain sheets of sentence-case text: insights, lists, callouts, the watch list and the footer.
 */

/** `insights`: headline and body pairs on one sheet. */
@Composable
fun InsightsSection(section: Section.Insights) {
    if (section.items.isEmpty()) return
    Sheet(title = section.title?.takeIf { it.isNotBlank() } ?: stringResource(R.string.report_insights_title)) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            section.items.forEach { item ->
                Column(Modifier.semantics(mergeDescendants = true) {}) {
                    Text(item.headline, style = MaterialTheme.typography.titleSmall, color = HesabuTheme.colors.ink)
                    Text(
                        item.body,
                        style = MaterialTheme.typography.bodyMedium,
                        color = HesabuTheme.colors.ink,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

/** `list`: a titled list of short lines. */
@Composable
fun ListSection(section: Section.ListSection) {
    if (section.items.isEmpty()) return
    Sheet(title = section.title) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            section.items.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink) }
        }
    }
}

/** `watch`: up to three things to keep an eye on next period. */
@Composable
fun WatchSection(section: Section.Watch) {
    if (section.items.isEmpty()) return
    Sheet(title = section.title) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            section.items.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink) }
        }
    }
}

/**
 * `callout`: one short note on a sheet with a 3 dp bar at the leading edge in its tone: soft ink for neutral, the fee
 * colour for fees, warn only for a genuine problem. The text itself stays in ink.
 */
@Composable
fun CalloutSection(section: Section.Callout) {
    val bar = when (section.tone) {
        "fee" -> HesabuTheme.colors.fee
        "warn" -> HesabuTheme.colors.warn
        else -> HesabuTheme.colors.inkSoft
    }
    Row(
        Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(8.dp))
            .background(HesabuTheme.colors.sheet),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(bar))
        Text(
            section.body,
            style = MaterialTheme.typography.bodyMedium,
            color = HesabuTheme.colors.ink,
            modifier = Modifier.padding(16.dp),
        )
    }
}

/** `footer`: which accounts were counted, how the numbers were made, and how many messages were not read. */
@Composable
fun FooterSection(section: Section.Footer) {
    val soft = HesabuTheme.colors.inkSoft
    val style = MaterialTheme.typography.bodySmall
    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.report_footer_heading), style = MaterialTheme.typography.titleSmall, color = HesabuTheme.colors.ink, modifier = Modifier.semantics { heading() })
        if (section.accountsCovered.isNotEmpty()) {
            Text(stringResource(R.string.report_footer_accounts, section.accountsCovered.joinToString(", ")), style = style, color = soft)
        }
        if (section.computedNote.isNotBlank()) Text(section.computedNote, style = style, color = soft)
        val unknown = section.unknownCount.trim()
        Text(
            if (unknown.isEmpty() || unknown == "0") {
                stringResource(R.string.report_footer_unknown_none)
            } else {
                stringResource(R.string.report_footer_unknown, unknown)
            },
            style = style,
            color = soft,
        )
    }
}
