package ke.hesabu.app.ui.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ke.hesabu.app.reports.Section
import ke.hesabu.app.ui.components.DoubleRule
import ke.hesabu.app.ui.components.Rule
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.tabular

/**
 * `table`: a ruled ledger table. Numeric columns are right-aligned in tabular figures and sized to their widest
 * measured cell, so an amount never breaks across lines; text columns share what is left. If the figures do not fit
 * at 14 they step down to 12 (the next size on the scale); if they still do not (a very narrow screen or large type),
 * every column takes a width in proportion to its longest cell and may wrap. The total row sits under the
 * bookkeeper's double rule in bold.
 */
@Composable
fun TableSection(section: Section.Table) {
    if (section.columns.isEmpty()) return
    val numeric = section.numericColumns.toSet()
    val headerStyle = MaterialTheme.typography.labelMedium
    val text = MaterialTheme.typography.bodyMedium
    val regular = HesabuTheme.money.small.copy(fontWeight = FontWeight.Normal)
    // One step down the type scale (14 to 12) before giving up on single-line amounts.
    val compact = regular.copy(fontSize = 12.sp, lineHeight = (12 * 1.1f).sp)
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    Sheet(title = section.title) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val gaps = GAP * (section.columns.size - 1)
            val plan = remember(section, density, maxWidth) {
                listOf(regular, compact).firstNotNullOfOrNull { figures ->
                    val measured = section.columns.indices.map { c ->
                        if (c !in numeric) return@map null
                        val bold = figures.copy(fontWeight = FontWeight.Bold)
                        val widths = listOf(measurer.measure(section.columns[c], headerStyle.tabular()).size.width) +
                            section.rows.mapNotNull { row -> row.getOrNull(c)?.let { measurer.measure(it, figures).size.width } } +
                            listOfNotNull(section.totalRow?.getOrNull(c)?.let { measurer.measure(it, bold).size.width })
                        with(density) { widths.max().toDp() } + 2.dp
                    }
                    val fixed = measured.filterNotNull().fold(0.dp) { a, b -> a + b }
                    val textColumns = measured.count { it == null }.coerceAtLeast(1)
                    if (fixed + gaps + MIN_TEXT_COLUMN * textColumns > maxWidth) return@firstNotNullOfOrNull null
                    TablePlan(measured.map { w -> if (w != null) ColumnWidth.Fixed(w) else ColumnWidth.Share(1f) }, figures)
                } ?: TablePlan(ReportMath.columnWeights(section).map { ColumnWidth.Share(it) }, regular)
            }
            val figures = plan.figures
            Column {
                TableLine(section.columns, plan.widths, numeric, headerStyle, headerStyle.tabular(), header = true)
                Rule()
                section.rows.forEachIndexed { i, row ->
                    TableLine(row, plan.widths, numeric, text, figures)
                    if (i < section.rows.lastIndex) Rule()
                }
                section.totalRow?.let { total ->
                    Spacer(Modifier.height(8.dp))
                    DoubleRule()
                    TableLine(total, plan.widths, numeric, text.copy(fontWeight = FontWeight.Bold), figures.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

/** The chosen column widths and the figure style they were measured with. */
private data class TablePlan(val widths: List<ColumnWidth>, val figures: TextStyle)

private val GAP = 8.dp
private val MIN_TEXT_COLUMN = 72.dp

/** How wide a column is: a measured width for figures, or a share of the remaining space. */
private sealed interface ColumnWidth {
    data class Fixed(val width: Dp) : ColumnWidth
    data class Share(val weight: Float) : ColumnWidth
}

@Composable
private fun TableLine(
    cells: List<String>,
    widths: List<ColumnWidth>,
    numeric: Set<Int>,
    textStyle: TextStyle,
    figureStyle: TextStyle,
    header: Boolean = false,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = if (header) 36.dp else 48.dp).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GAP),
    ) {
        widths.forEachIndexed { c, w ->
            val isNumber = c in numeric
            Text(
                cells.getOrNull(c).orEmpty(),
                style = if (isNumber) figureStyle else textStyle,
                color = if (header) HesabuTheme.colors.inkSoft else HesabuTheme.colors.ink,
                textAlign = if (isNumber) TextAlign.End else TextAlign.Start,
                maxLines = if (isNumber && w is ColumnWidth.Fixed) 1 else 2,
                softWrap = !(isNumber && w is ColumnWidth.Fixed),
                modifier = when (w) {
                    is ColumnWidth.Fixed -> Modifier.width(w.width)
                    is ColumnWidth.Share -> Modifier.weight(w.weight)
                },
            )
        }
    }
}
