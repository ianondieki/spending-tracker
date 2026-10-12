@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package ke.hesabu.app.ui.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ke.hesabu.app.R
import ke.hesabu.app.ui.Periods
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.components.QuietButton
import ke.hesabu.app.ui.components.Rule
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.components.SkeletonRows
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.home.TransactionRow
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone

/** Transactions grouped by day with running totals, search and filters; tapping a row opens the detail sheet. */
@Composable
fun TransactionsScreen(
    onOpenTransaction: (String) -> Unit,
    onOpenTeach: () -> Unit,
    onOpenImport: () -> Unit,
    vm: TransactionsViewModel = graphViewModel { TransactionsViewModel(it) },
) {
    val state by vm.state.collectAsStateWithLifecycle()
    TransactionsContent(state, onQuery = vm::setQuery, onFilters = vm::setFilters, onClear = vm::clearFilters, onOpenTransaction, onOpenTeach, onOpenImport)
}

@Composable
fun TransactionsContent(
    state: TransactionsViewModel.State,
    onQuery: (String) -> Unit = {},
    onFilters: (TransactionsViewModel.Filters) -> Unit = {},
    onClear: () -> Unit = {},
    onOpenTransaction: (String) -> Unit = {},
    onOpenTeach: () -> Unit = {},
    onOpenImport: () -> Unit = {},
    nowMillis: Long = System.currentTimeMillis(),
) {
    val periods = Periods(java.time.ZoneId.of(state.timeZone))
    var showFilters by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf(state.filters.query) }

    HesabuScreen(
        title = stringResource(R.string.nav_transactions),
        scrollable = false,
        contentPadding = PaddingValues(0.dp),
        actions = {
            IconButton(onClick = { showFilters = !showFilters }, modifier = Modifier.padding(end = 4.dp)) {
                Icon(Icons.Outlined.FilterList, contentDescription = stringResource(R.string.tx_filters), tint = if (state.filters.active > 0) HesabuTheme.colors.biro else HesabuTheme.colors.ink)
            }
        },
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it; onQuery(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text(stringResource(R.string.tx_search_hint)) },
                    singleLine = true,
                    shape = RoundedCornerShape(4.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    trailingIcon = if (query.isNotEmpty()) {
                        { IconButton(onClick = { query = ""; onQuery("") }) { Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.tx_clear_search)) } }
                    } else null,
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = HesabuTheme.colors.biro, unfocusedBorderColor = HesabuTheme.colors.rule, focusedContainerColor = HesabuTheme.colors.sheet, unfocusedContainerColor = HesabuTheme.colors.sheet),
                )
            }
            if (showFilters || state.filters.active > 0) {
                item { FilterSheet(state, onFilters, onClear) }
            }
            if (state.loading) {
                item { Sheet { SkeletonRows(6) } }
            } else if (state.ledgerEmpty) {
                item {
                    EmptyState(
                        title = stringResource(R.string.home_empty_title),
                        body = stringResource(R.string.home_empty_body),
                        actionLabel = stringResource(R.string.home_empty_action),
                        onAction = onOpenImport,
                    )
                }
            } else if (state.groups.isEmpty()) {
                item { EmptyState(title = stringResource(R.string.tx_none_match_title), body = stringResource(R.string.tx_none_match_body), actionLabel = stringResource(R.string.tx_clear_filters), onAction = { query = ""; onQuery(""); onClear() }) }
            } else {
                item {
                    Sheet {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(R.string.tx_total_out, state.count), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
                                MoneyText(state.totalOutCents, tone = MoneyTone.Out, style = HesabuTheme.money.large, textAlign = androidx.compose.ui.text.style.TextAlign.Start)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(stringResource(R.string.tx_total_in), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
                                MoneyText(state.totalInCents, tone = MoneyTone.In, style = HesabuTheme.money.emphasis)
                            }
                        }
                        QuietButton(stringResource(R.string.home_teach_action), onOpenTeach)
                    }
                }
                items(state.groups, key = { it.day.toString() }) { g ->
                    Sheet(padding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                periods.dayHeader(g.day, nowMillis, stringResource(R.string.tx_today), stringResource(R.string.tx_yesterday)),
                                style = MaterialTheme.typography.titleSmall,
                                color = HesabuTheme.colors.ink,
                                modifier = Modifier.weight(1f).semantics { heading() },
                            )
                            Column(horizontalAlignment = Alignment.End) {
                                MoneyText(g.dayOutCents, tone = MoneyTone.Out, style = HesabuTheme.money.small)
                                Text(stringResource(R.string.tx_running, ke.hesabu.app.parse.Money.formatKsh(g.runningOutCents)), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
                            }
                        }
                        Rule()
                        g.rows.forEachIndexed { i, t -> TransactionRow(t, periods, onClick = { onOpenTransaction(t.id) }, showRule = i < g.rows.size - 1) }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun FilterSheet(state: TransactionsViewModel.State, onFilters: (TransactionsViewModel.Filters) -> Unit, onClear: () -> Unit) {
    val f = state.filters
    Sheet(title = stringResource(R.string.tx_filters)) {
        ChipRow(stringResource(R.string.tx_filter_period)) {
            TransactionsViewModel.Period.entries.forEach { p ->
                Chip(selected = f.period == p, label = when (p) {
                    TransactionsViewModel.Period.All -> stringResource(R.string.tx_period_all)
                    TransactionsViewModel.Period.ThisWeek -> stringResource(R.string.tx_period_this_week)
                    TransactionsViewModel.Period.LastWeek -> stringResource(R.string.tx_period_last_week)
                    TransactionsViewModel.Period.ThisMonth -> stringResource(R.string.tx_period_this_month)
                }) { onFilters(f.copy(period = p)) }
            }
        }
        ChipRow(stringResource(R.string.tx_filter_direction)) {
            Chip(f.direction == null, stringResource(R.string.tx_period_all)) { onFilters(f.copy(direction = null)) }
            Chip(f.direction == "out", stringResource(R.string.tx_dir_out)) { onFilters(f.copy(direction = "out")) }
            Chip(f.direction == "in", stringResource(R.string.tx_dir_in)) { onFilters(f.copy(direction = "in")) }
            Chip(!f.includeTransfers, stringResource(R.string.tx_hide_transfers)) { onFilters(f.copy(includeTransfers = !f.includeTransfers)) }
        }
        if (state.accounts.size > 1) ChipRow(stringResource(R.string.tx_filter_account)) {
            state.accounts.forEach { a -> Chip(f.accountRef == a.accountRef, a.label) { onFilters(f.copy(accountRef = if (f.accountRef == a.accountRef) null else a.accountRef)) } }
        }
        if (state.categories.isNotEmpty()) ChipRow(stringResource(R.string.tx_filter_category)) {
            state.categories.filter { it.parentId == null }.forEach { c -> Chip(f.categoryId == c.id, c.nameEn) { onFilters(f.copy(categoryId = if (f.categoryId == c.id) null else c.id)) } }
        }
        if (f.active > 0) QuietButton(stringResource(R.string.tx_clear_filters), onClear)
    }
}

@Composable
private fun ChipRow(label: String, content: @Composable () -> Unit) {
    Text(label, style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 8.dp))
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}

@Composable
private fun Chip(selected: Boolean, label: String, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        shape = RoundedCornerShape(4.dp),
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = HesabuTheme.colors.biro, selectedLabelColor = HesabuTheme.colors.onBiro, containerColor = HesabuTheme.colors.paper, labelColor = HesabuTheme.colors.ink),
        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected, borderColor = HesabuTheme.colors.rule, selectedBorderColor = HesabuTheme.colors.biro),
    )
}
