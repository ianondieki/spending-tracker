package ke.hesabu.app.ui.accounts

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import ke.hesabu.app.AppGraph
import ke.hesabu.app.R
import ke.hesabu.app.data.AccountEntity
import ke.hesabu.app.ui.Periods
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.KeyValue
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.components.SkeletonRows
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn

/** Accounts: last known balance from the last message, this month's in, out and fees, last message time. */
class AccountsViewModel(private val graph: AppGraph, private val now: () -> Long = System::currentTimeMillis) : ViewModel() {

    data class Row(val account: AccountEntity, val monthOut: Long, val monthIn: Long, val monthFees: Long, val count: Int)
    data class State(val loading: Boolean = true, val rows: List<Row> = emptyList(), val timeZone: String = "Africa/Nairobi")

    val state = graph.settings.settings.flatMapLatest { s ->
        val p = Periods(java.time.ZoneId.of(s.timeZone))
        val month = p.thisMonth(now())
        combine(graph.db.accountDao().observeAll(), graph.db.transactionDao().observeBetween(month.fromMillis, month.toMillis)) { accounts, txs ->
            State(
                loading = false,
                rows = accounts.map { a ->
                    val mine = txs.filter { it.accountRef == a.accountRef }
                    Row(
                        a,
                        monthOut = mine.filter { it.direction == "out" && !it.isTransfer }.sumOf { it.amountCents },
                        monthIn = mine.filter { it.direction == "in" && !it.isTransfer }.sumOf { it.amountCents },
                        monthFees = mine.sumOf { it.feeCents },
                        count = mine.size,
                    )
                },
                timeZone = s.timeZone,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), State())
}

@Composable
fun AccountsScreen(onBack: (() -> Unit)? = null, vm: AccountsViewModel = graphViewModel { AccountsViewModel(it) }) {
    val state by vm.state.collectAsStateWithLifecycle()
    AccountsContent(state, onBack)
}

@Composable
fun AccountsContent(state: AccountsViewModel.State, onBack: (() -> Unit)? = null) {
    val periods = Periods(java.time.ZoneId.of(state.timeZone))
    HesabuScreen(title = stringResource(R.string.accounts_title), subtitle = stringResource(R.string.accounts_subtitle), onBack = onBack) {
        when {
            state.loading -> Sheet { SkeletonRows(3) }
            state.rows.isEmpty() -> EmptyState(stringResource(R.string.accounts_empty_title), stringResource(R.string.accounts_empty_body))
            else -> state.rows.forEach { r ->
                Sheet(title = r.account.label) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                        Text(stringResource(R.string.accounts_balance), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.weight(1f))
                        if (r.account.lastBalanceCents != null) MoneyText(r.account.lastBalanceCents, tone = MoneyTone.Neutral, style = HesabuTheme.money.large, decimals = 2)
                        else Text(stringResource(R.string.home_balance_unknown), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, textAlign = TextAlign.End)
                    }
                    if (r.account.lastBalanceAtMillis != null) KeyValue(stringResource(R.string.accounts_balance_at), periods.dateTimeOf(r.account.lastBalanceAtMillis))
                    MoneyLine(stringResource(R.string.accounts_month_out), r.monthOut, MoneyTone.Out)
                    MoneyLine(stringResource(R.string.accounts_month_in), r.monthIn, MoneyTone.In)
                    MoneyLine(stringResource(R.string.accounts_month_fees), r.monthFees, MoneyTone.Fee)
                    if (r.account.lastMessageAtMillis != null) KeyValue(stringResource(R.string.accounts_last_message), periods.dateTimeOf(r.account.lastMessageAtMillis))
                    if (r.account.institution != null) KeyValue(stringResource(R.string.accounts_institution), r.account.institution)
                }
            }
        }
    }
}

@Composable
private fun MoneyLine(label: String, cents: Long, tone: MoneyTone) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.weight(1f))
        MoneyText(cents, tone = tone)
    }
}
