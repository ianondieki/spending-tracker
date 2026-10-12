@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package ke.hesabu.app.ui.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ke.hesabu.app.R
import ke.hesabu.app.data.CategoryEntity
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.Periods
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.KeyValue
import ke.hesabu.app.ui.components.LoadingState
import ke.hesabu.app.ui.components.MoneyText
import ke.hesabu.app.ui.components.SecondaryButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.home.typeLabel
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone

/** One transaction: every field that was counted, and the three edits (category, transfer, note). */
@Composable
fun TransactionDetailScreen(id: String, onBack: () -> Unit, vm: TransactionsViewModel = graphViewModel { TransactionsViewModel(it) }) {
    val tx by vm.observe(id).collectAsStateWithLifecycle(initialValue = null)
    val state by vm.state.collectAsStateWithLifecycle()
    val t = tx
    if (t == null) {
        HesabuScreen(title = stringResource(R.string.tx_detail_title), onBack = onBack) {
            if (state.loading) LoadingState(stringResource(R.string.loading)) else EmptyState(stringResource(R.string.tx_missing_title), stringResource(R.string.tx_missing_body))
        }
        return
    }
    TransactionDetailContent(
        t, state.categories, Periods(java.time.ZoneId.of(state.timeZone)), onBack,
        onCategory = { c, remember -> vm.setCategory(t, c, remember) },
        onTransfer = { vm.setTransfer(t, it) },
        onNote = { vm.setNote(t, it) },
    )
}

@Composable
fun TransactionDetailContent(
    t: TransactionEntity,
    categories: List<CategoryEntity>,
    periods: Periods,
    onBack: () -> Unit,
    onCategory: (String?, Boolean) -> Unit,
    onTransfer: (Boolean) -> Unit,
    onNote: (String) -> Unit,
) {
    val tone = when { t.isTransfer -> MoneyTone.Transfer; t.direction == "in" -> MoneyTone.In; else -> MoneyTone.Out }
    HesabuScreen(title = t.counterpartyName ?: typeLabel(t.type), subtitle = periods.dateTimeOf(t.occurredAtMillis), onBack = onBack) {
        Sheet {
            MoneyText(t.amountCents, tone = tone, style = HesabuTheme.money.hero, decimals = 2, textAlign = TextAlign.Start, modifier = Modifier.fillMaxWidth())
            Text(
                listOfNotNull(typeLabel(t.type), if (t.isTransfer) stringResource(R.string.tx_transfer) else null).joinToString(", "),
                style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft,
            )
            if (t.feeCents > 0) KeyValue(stringResource(R.string.tx_detail_fee), Money.formatKsh(t.feeCents, 2))
            if (t.balanceAfterCents != null) KeyValue(stringResource(R.string.tx_detail_balance_after), Money.formatKsh(t.balanceAfterCents, 2))
            if (t.externalRef != null) KeyValue(stringResource(R.string.tx_detail_ref), t.externalRef)
            if (t.counterpartyRefMasked != null) KeyValue(stringResource(R.string.tx_detail_number), t.counterpartyRefMasked)
            if (t.counterpartyAccountRef != null) KeyValue(stringResource(R.string.tx_detail_account), t.counterpartyAccountRef)
            if (t.till != null) KeyValue(stringResource(R.string.tx_detail_till), t.till)
            KeyValue(stringResource(R.string.tx_detail_account_of), t.accountRef.substringBefore(':').uppercase().replace("MPESA", "M-PESA"))
            if (t.balanceBreak) Text(stringResource(R.string.tx_detail_balance_break), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.fee, modifier = Modifier.padding(top = 8.dp))
        }

        Sheet(title = stringResource(R.string.tx_detail_category)) {
            var remember by rememberSaveable { mutableStateOf(true) }
            Text(
                when (t.categorySource) {
                    "user" -> stringResource(R.string.tx_cat_source_user)
                    "merchant" -> stringResource(R.string.tx_cat_source_merchant)
                    "provider_default" -> stringResource(R.string.tx_cat_source_default)
                    "rule" -> stringResource(R.string.tx_cat_source_rule)
                    else -> stringResource(R.string.tx_cat_source_none)
                },
                style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft,
            )
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                categories.filter { it.parentId == null }.forEach { c ->
                    FilterChip(
                        selected = t.categoryId == c.id,
                        onClick = { onCategory(if (t.categoryId == c.id) null else c.id, remember) },
                        label = { Text(c.nameEn) },
                        shape = RoundedCornerShape(4.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = HesabuTheme.colors.biro, selectedLabelColor = HesabuTheme.colors.onBiro, containerColor = HesabuTheme.colors.paper, labelColor = HesabuTheme.colors.ink),
                        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = t.categoryId == c.id, borderColor = HesabuTheme.colors.rule, selectedBorderColor = HesabuTheme.colors.biro),
                    )
                }
            }
            if (t.counterpartyName != null || t.paybill != null || t.till != null) {
                ToggleRow(stringResource(R.string.tx_remember_rule, t.counterpartyName ?: t.paybill ?: t.till ?: ""), remember) { remember = it }
            }
        }

        Sheet(title = stringResource(R.string.tx_detail_transfer_title)) {
            Text(stringResource(R.string.tx_detail_transfer_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
            ToggleRow(stringResource(R.string.tx_detail_transfer_toggle), t.isTransfer, onTransfer)
        }

        Sheet(title = stringResource(R.string.tx_detail_note)) {
            var note by rememberSaveable(t.id) { mutableStateOf(t.note ?: "") }
            OutlinedTextField(
                value = note, onValueChange = { note = it.take(500) }, modifier = Modifier.fillMaxWidth(), minLines = 2, shape = RoundedCornerShape(4.dp),
                placeholder = { Text(stringResource(R.string.tx_note_hint)) },
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = HesabuTheme.colors.biro, unfocusedBorderColor = HesabuTheme.colors.rule),
            )
            if (note != (t.note ?: "")) SecondaryButton(stringResource(R.string.action_save), { onNote(note) }, Modifier.padding(top = 8.dp))
        }

        Sheet(title = stringResource(R.string.tx_detail_parser)) {
            KeyValue(stringResource(R.string.tx_detail_pack), "${t.packId} ${t.packVersion}")
            KeyValue(stringResource(R.string.tx_detail_family), t.familyId)
            KeyValue(stringResource(R.string.tx_detail_confidence), "${(t.parseConfidence * 100).toInt()} %")
            KeyValue(stringResource(R.string.tx_detail_source), t.source)
            Text(stringResource(R.string.tx_detail_body_note), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink, modifier = Modifier.weight(1f))
        Switch(
            checked = checked, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = HesabuTheme.colors.biro, checkedThumbColor = HesabuTheme.colors.onBiro, uncheckedTrackColor = HesabuTheme.colors.paper, uncheckedBorderColor = HesabuTheme.colors.rule, uncheckedThumbColor = HesabuTheme.colors.inkSoft),
        )
    }
}
