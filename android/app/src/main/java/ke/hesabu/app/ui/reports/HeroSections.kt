package ke.hesabu.app.ui.reports

import ke.hesabu.app.ui.components.tabularDigits
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.reports.KpiItem
import ke.hesabu.app.reports.Section
import ke.hesabu.app.ui.components.Rule
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.components.Tally
import ke.hesabu.app.ui.components.TallyRow
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.forTone
import kotlinx.serialization.json.JsonObject

/*
 * The money-counting sections at the top of a report: the hero tally and the KPI grid. Both sit on ruled sheets,
 * because money is being counted here.
 */

/** `hero`: the tally (days, or top categories plus the rest) adding up to the total, the change, and the verdict. */
@Composable
fun HeroSection(hero: Section.Hero, facts: JsonObject?, kind: String, revealKey: Any) {
    val total = ReportMath.heroTotalCents(hero, facts)
    val rest = ReportMath.tallyRemainder(hero, total)
    val restLabel = stringResource(R.string.report_hero_rest)
    val rows = hero.tally.map { TallyRow(it.label, it.cents, MoneyTone.Out) } +
        (if (rest > 0 && hero.tally.isNotEmpty()) listOf(TallyRow(restLabel, rest, MoneyTone.Out)) else emptyList())
    Sheet {
        Tally(
            rows = rows,
            totalLabel = stringResource(if (kind == "monthly") R.string.report_hero_total_month else R.string.report_hero_total_week),
            totalCents = total,
            revealKey = revealKey,
        )
        DeltaLine(hero.delta, hero.deltaDirection, kind, Modifier.padding(top = 12.dp))
        Text(
            hero.verdict,
            style = MaterialTheme.typography.bodyLarge,
            color = HesabuTheme.colors.ink,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/** The change on the previous period: the signed figure in ink, then the direction in words (no arrows, no red). */
@Composable
private fun DeltaLine(delta: String, direction: String, kind: String, modifier: Modifier = Modifier) {
    val monthly = kind == "monthly"
    val phrase = stringResource(
        when (direction) {
            "up" -> if (monthly) R.string.report_delta_up_month else R.string.report_delta_up_week
            "down" -> if (monthly) R.string.report_delta_down_month else R.string.report_delta_down_week
            "flat" -> if (monthly) R.string.report_delta_flat_month else R.string.report_delta_flat_week
            else -> if (monthly) R.string.report_delta_na_month else R.string.report_delta_na_week
        },
    )
    val figure = delta.trim().takeIf { it.isNotEmpty() && direction != "na" }
    val spoken = figure?.let { f -> ReportMath.spokenAmount(f)?.let { stringResource(R.string.money_a11y, it) } ?: f }
    Row(
        modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            contentDescription = listOfNotNull(spoken, phrase).joinToString(" ")
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (figure != null) Text(tabularDigits(figure), style = HesabuTheme.money.small, color = HesabuTheme.colors.ink)
        Text(phrase, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
    }
}

/** `kpis`: up to four figures in a two-column grid, each coloured by its tone, ruled between rows. */
@Composable
fun KpisSection(kpis: Section.Kpis) {
    if (kpis.items.isEmpty()) return
    Sheet {
        val rows = kpis.items.chunked(2)
        rows.forEachIndexed { i, pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                pair.forEach { KpiCell(it, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
            if (i < rows.lastIndex) Rule()
        }
    }
}

@Composable
private fun KpiCell(item: KpiItem, modifier: Modifier = Modifier) {
    val color = HesabuTheme.colors.forTone(ReportMath.tone(item.tone))
    val spokenValue = ReportMath.spokenAmount(item.value)?.let { stringResource(R.string.money_a11y, it) } ?: item.value
    val spokenDelta = item.delta?.let { d -> ReportMath.spokenAmount(d)?.let { stringResource(R.string.money_a11y, it) } ?: d }
    Column(
        modifier
            .padding(vertical = 12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = listOfNotNull(item.label, spokenValue, spokenDelta).joinToString(", ")
            },
    ) {
        Text(item.label, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, maxLines = 2)
        Text(tabularDigits(item.value), style = HesabuTheme.money.emphasis, color = color, modifier = Modifier.padding(top = 4.dp))
        if (!item.delta.isNullOrBlank()) {
            Text(tabularDigits(item.delta), style = HesabuTheme.money.small, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 2.dp))
        }
    }
}
