package ke.hesabu.app.ui.home

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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ke.hesabu.app.R
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.Periods
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.components.QuietButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.components.SkeletonRows
import ke.hesabu.app.ui.components.Tally
import ke.hesabu.app.ui.components.TallyRow
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import ke.hesabu.app.ui.theme.tabular

/** Home: the week's tally opens the screen; accounts, unknowns and the next report sit quietly below. */
@Composable
fun HomeScreen(
    onOpenTransactions: () -> Unit,
    onOpenTeach: () -> Unit,
    onOpenAccounts: () -> Unit,
    onOpenImport: () -> Unit,
    onOpenTransaction: (String) -> Unit,
    vm: HomeViewModel = graphViewModel { HomeViewModel(it) },
) {
    val state by vm.state.collectAsStateWithLifecycle()
    HomeContent(state, onOpenTransactions, onOpenTeach, onOpenAccounts, onOpenImport, onOpenTransaction)
}

@Composable
fun HomeContent(
    state: HomeViewModel.State,
    onOpenTransactions: () -> Unit = {},
    onOpenTeach: () -> Unit = {},
    onOpenAccounts: () -> Unit = {},
    onOpenImport: () -> Unit = {},
    onOpenTransaction: (String) -> Unit = {},
    nowMillis: Long = System.currentTimeMillis(),
) {
    val periods = Periods(java.time.ZoneId.of(state.settings.timeZone))
    HesabuScreen(
        title = stringResource(R.string.home_title),
        subtitle = if (state.loading) null else stringResource(R.string.home_week_from, periods.shortDate(state.weekStart)),
    ) {
        when {
            state.loading -> Sheet { SkeletonRows(5) }
            state.ledgerEmpty -> EmptyState(
                title = stringResource(R.string.home_empty_title),
                body = stringResource(R.string.home_empty_body),
                actionLabel = stringResource(R.string.home_empty_action),
                onAction = onOpenImport,
            )
            else -> Sheet {
                Tally(
                    rows = state.days.map { TallyRow(periods.dayName(it.day, state.settings.locale), it.cents, MoneyTone.Out, pluralStringResource(R.plurals.home_day_count, it.count, it.count)) },
                    totalLabel = stringResource(R.string.home_week_total),
                    totalCents = state.weekOutCents,
                    revealKey = state.weekStart,
                    emptyText = stringResource(R.string.home_week_nothing_yet),
                )
                Spacer(Modifier.height(16.dp))
                Kpi(stringResource(R.string.home_kpi_in), state.weekInCents, MoneyTone.In)
                Kpi(stringResource(R.string.home_kpi_fees), state.weekFeeCents, MoneyTone.Fee)
                val delta = state.lastWeekOutCents?.let { state.weekOutCents - it }
                if (delta != null) {
                    Text(
                        when {
                            delta > 0 -> stringResource(R.string.home_delta_more, Money.formatKsh(delta))
                            delta < 0 -> stringResource(R.string.home_delta_less, Money.formatKsh(-delta))
                            else -> stringResource(R.string.home_delta_same)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = HesabuTheme.colors.inkSoft,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                QuietButton(stringResource(R.string.home_see_transactions), onOpenTransactions, Modifier.padding(top = 8.dp))
            }
        }

        if (state.unknownCount > 0) {
            Sheet(title = stringResource(R.string.home_teach_title)) {
                Text(
                    pluralStringResource(R.plurals.home_teach_body, state.unknownCount, state.unknownCount),
                    style = MaterialTheme.typography.bodyMedium,
                    color = HesabuTheme.colors.ink,
                )
                QuietButton(stringResource(R.string.home_teach_action), onOpenTeach, Modifier.padding(top = 4.dp))
            }
        }

        if (state.accounts.isNotEmpty()) {
            Sheet(title = stringResource(R.string.home_accounts_title)) {
                state.accounts.forEachIndexed { i, a ->
                    LedgerRow(
                        label = a.label,
                        secondary = a.lastBalanceAtMillis?.let { stringResource(R.string.home_balance_at, periods.dateTimeOf(it)) },
                        onClick = onOpenAccounts,
                        showRule = i < state.accounts.size - 1,
                    ) {
                        if (a.lastBalanceCents != null) MoneyText(a.lastBalanceCents, tone = MoneyTone.Neutral)
                        else Text(stringResource(R.string.home_balance_unknown), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
                    }
                }
            }
        }

        if (state.recent.isNotEmpty()) {
            Sheet(title = stringResource(R.string.home_recent_title)) {
                state.recent.forEachIndexed { i, t -> TransactionRow(t, periods, onClick = { onOpenTransaction(t.id) }, showRule = i < state.recent.size - 1) }
            }
        }

        Sheet(title = stringResource(R.string.home_next_report_title)) {
            val next = state.nextReportAt
            Text(
                if (next != null) stringResource(R.string.home_next_report_at, periods.dateTimeOf(next.toInstant().toEpochMilli()))
                else stringResource(R.string.home_next_report_unknown),
                style = MaterialTheme.typography.bodyMedium.tabular(),
                color = HesabuTheme.colors.ink,
            )
            if (!state.settings.syncConfigured) {
                Text(stringResource(R.string.home_sync_not_configured), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 4.dp))
            } else if (state.syncQueued > 0) {
                Text(pluralStringResource(R.plurals.home_sync_queued, state.syncQueued, state.syncQueued), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

/** A quiet ledger line under the tally: label left, amount right, no rule. */
@Composable
private fun Kpi(label: String, cents: Long, tone: MoneyTone) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.weight(1f))
        MoneyText(cents, tone = tone)
    }
}

/** One ledger row for a transaction: counterparty, time and type, the amount by meaning. */
@Composable
fun TransactionRow(t: TransactionEntity, periods: Periods, onClick: () -> Unit, showRule: Boolean = true, showDate: Boolean = false) {
    val tone = when {
        t.isTransfer -> MoneyTone.Transfer
        t.type == "WITHDRAW" || t.type == "ATM" -> MoneyTone.Transfer
        t.direction == "in" -> MoneyTone.In
        else -> MoneyTone.Out
    }
    val label = t.counterpartyName ?: typeLabel(t.type)
    val secondary = buildString {
        append(if (showDate) periods.dateTimeOf(t.occurredAtMillis) else periods.timeOf(t.occurredAtMillis))
        append(", ")
        append(typeLabel(t.type))
        if (t.isTransfer) append(", ").append(stringResource(R.string.tx_transfer))
    }
    LedgerRow(
        label = label,
        cents = t.amountCents,
        tone = tone,
        secondary = secondary,
        trailing = if (t.feeCents > 0) stringResource(R.string.tx_fee, Money.formatKsh(t.feeCents)) else null,
        onClick = onClick,
        showRule = showRule,
    )
}

@Composable
fun typeLabel(type: String): String = when (type) {
    "SEND_MONEY" -> stringResource(R.string.type_send_money)
    "RECEIVE_MONEY" -> stringResource(R.string.type_receive_money)
    "PAYBILL" -> stringResource(R.string.type_paybill)
    "BUY_GOODS" -> stringResource(R.string.type_buy_goods)
    "WITHDRAW", "ATM" -> stringResource(R.string.type_withdraw)
    "DEPOSIT" -> stringResource(R.string.type_deposit)
    "AIRTIME" -> stringResource(R.string.type_airtime)
    "FULIZA_DRAWDOWN" -> stringResource(R.string.type_fuliza)
    "FULIZA_REPAY" -> stringResource(R.string.type_fuliza_repay)
    "MSHWARI_DEPOSIT", "MSHWARI_WITHDRAW", "KCB_MPESA" -> stringResource(R.string.type_savings)
    "BANK_TO_MPESA", "MPESA_TO_BANK", "INTERNAL_TRANSFER" -> stringResource(R.string.type_bank_transfer)
    "POCHI" -> stringResource(R.string.type_pochi)
    "REVERSAL" -> stringResource(R.string.type_reversal)
    "FEE" -> stringResource(R.string.type_fee)
    else -> type.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }
}
