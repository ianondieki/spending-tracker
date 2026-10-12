@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package ke.hesabu.app.ui.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import ke.hesabu.app.AppGraph
import ke.hesabu.app.R
import ke.hesabu.app.data.CategoryEntity
import ke.hesabu.app.data.SyncQueueEntity
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.data.UnknownMessageEntity
import ke.hesabu.app.parse.Money
import ke.hesabu.app.ui.Periods
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.PrimaryButton
import ke.hesabu.app.ui.components.QuietButton
import ke.hesabu.app.ui.components.Rule
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.theme.HesabuTheme
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

/** "Teach Hesabu": messages from money senders that no pack understood, labelled in one tap each. */
class TeachViewModel(private val graph: AppGraph, private val now: () -> Long = System::currentTimeMillis) : ViewModel() {

    data class Item(val row: UnknownMessageEntity, val body: String?, val suggestedCents: Long?)
    data class State(val loading: Boolean = true, val items: List<Item> = emptyList(), val categories: List<CategoryEntity> = emptyList(), val timeZone: String = "Africa/Nairobi")

    enum class Label(val type: String, val direction: String) { Spent("OTHER", "out"), Received("OTHER", "in"), Transfer("INTERNAL_TRANSFER", "out"), Fee("FEE", "out") }

    private val amountRx = Regex("""(?:Ksh|KES|KSh|Kshs)\.?\s?([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)

    val state = combine(graph.db.unknownMessageDao().observePending(), graph.db.categoryDao().observeAll(), graph.settings.settings) { rows, cats, s ->
        State(
            loading = false,
            items = rows.map { r ->
                val body = runCatching { graph.bodyCipher.decrypt(r.bodyEncrypted) }.getOrNull()
                val cents = body?.let { b -> amountRx.find(b)?.groupValues?.get(1)?.let { Money.parseKesToCents(it) } }
                Item(r, body, cents)
            },
            categories = cats,
            timeZone = s.timeZone,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), State())

    /** Creates a manual transaction from the label and marks the message labelled. */
    fun label(item: Item, label: Label, cents: Long, categoryId: String?) = viewModelScope.launch {
        val t = now()
        val id = UUID.randomUUID().toString()
        val tx = TransactionEntity(
            id = id, accountRef = accountRefFor(item.row.sender), provider = providerFor(item.row.sender), externalRef = null,
            type = label.type, direction = label.direction, amountCents = cents, feeCents = if (label == Label.Fee) 0 else 0, balanceAfterCents = null,
            occurredAtMillis = item.row.receivedAtMillis, receivedAtMillis = item.row.receivedAtMillis,
            counterpartyName = null, counterpartyKind = "unknown", counterpartyRefMasked = null, paybill = null, till = null, counterpartyAccountRef = null,
            categoryId = categoryId, categorySource = if (categoryId != null) "user" else "none", categoryConfidence = if (categoryId != null) 1.0 else 0.0,
            isTransfer = label == Label.Transfer, isTransferHint = false, transferPairId = null, parseConfidence = 0.5, source = "manual",
            rawHash = item.row.rawHash, packId = "manual", packVersion = "0", familyId = "user_label", userEdited = true, note = null, updatedAtMillis = t,
        )
        graph.db.transactionDao().insertAll(listOf(tx))
        graph.db.syncQueueDao().enqueueAll(listOf(SyncQueueEntity(id, t)))
        graph.db.unknownMessageDao().update(item.row.copy(status = "labelled", labelledTransactionId = id, updatedAtMillis = t))
    }

    fun dismiss(item: Item) = viewModelScope.launch {
        graph.db.unknownMessageDao().update(item.row.copy(status = "dismissed", updatedAtMillis = now()))
    }

    private fun providerFor(sender: String): String = graph.engine.providerFor(sender) ?: "unknown"
    private fun accountRefFor(sender: String): String = graph.engine.accountRefFor(sender) ?: "unknown:${sender.trim().lowercase()}"
}

@Composable
fun TeachScreen(onBack: () -> Unit, vm: TeachViewModel = graphViewModel { TeachViewModel(it) }) {
    val state by vm.state.collectAsStateWithLifecycle()
    TeachContent(state, onBack, onLabel = vm::label, onDismiss = vm::dismiss)
}

@Composable
fun TeachContent(
    state: TeachViewModel.State,
    onBack: () -> Unit,
    onLabel: (TeachViewModel.Item, TeachViewModel.Label, Long, String?) -> Unit,
    onDismiss: (TeachViewModel.Item) -> Unit,
) {
    val periods = Periods(java.time.ZoneId.of(state.timeZone))
    HesabuScreen(
        title = stringResource(R.string.teach_title),
        subtitle = if (state.items.isEmpty()) null else pluralStringResource(R.plurals.teach_subtitle, state.items.size, state.items.size),
        onBack = onBack,
    ) {
        if (!state.loading && state.items.isEmpty()) {
            EmptyState(stringResource(R.string.teach_empty_title), stringResource(R.string.teach_empty_body))
        }
        state.items.forEach { item -> TeachItem(item, state.categories, periods, onLabel, onDismiss) }
    }
}

@Composable
private fun TeachItem(
    item: TeachViewModel.Item,
    categories: List<CategoryEntity>,
    periods: Periods,
    onLabel: (TeachViewModel.Item, TeachViewModel.Label, Long, String?) -> Unit,
    onDismiss: (TeachViewModel.Item) -> Unit,
) {
    var label by rememberSaveable(item.row.id) { mutableStateOf<TeachViewModel.Label?>(null) }
    var amount by rememberSaveable(item.row.id) { mutableStateOf(item.suggestedCents?.let { Money.formatPlain(it, 2) } ?: "") }
    var category by rememberSaveable(item.row.id) { mutableStateOf<String?>(null) }
    val cents = Money.parseKesToCents(amount)

    Sheet {
        Text("${item.row.sender.uppercase()}, ${periods.dateTimeOf(item.row.receivedAtMillis)}", style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
        Text(item.body ?: stringResource(R.string.teach_body_unavailable), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink, modifier = Modifier.padding(vertical = 8.dp))
        Rule()
        Text(stringResource(R.string.teach_what_is_it), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TeachViewModel.Label.entries.forEach { l ->
                val text = when (l) {
                    TeachViewModel.Label.Spent -> stringResource(R.string.teach_label_spent)
                    TeachViewModel.Label.Received -> stringResource(R.string.teach_label_received)
                    TeachViewModel.Label.Transfer -> stringResource(R.string.teach_label_transfer)
                    TeachViewModel.Label.Fee -> stringResource(R.string.teach_label_fee)
                }
                FilterChip(
                    selected = label == l, onClick = { label = l }, label = { Text(text) }, shape = RoundedCornerShape(4.dp),
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = HesabuTheme.colors.biro, selectedLabelColor = HesabuTheme.colors.onBiro, containerColor = HesabuTheme.colors.paper, labelColor = HesabuTheme.colors.ink),
                    border = FilterChipDefaults.filterChipBorder(enabled = true, selected = label == l, borderColor = HesabuTheme.colors.rule, selectedBorderColor = HesabuTheme.colors.biro),
                )
            }
        }
        if (label != null) {
            OutlinedTextField(
                value = amount, onValueChange = { amount = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), singleLine = true,
                label = { Text(stringResource(R.string.teach_amount)) }, prefix = { Text("KSh ") }, shape = RoundedCornerShape(4.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                isError = amount.isNotEmpty() && cents == null,
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = HesabuTheme.colors.biro, unfocusedBorderColor = HesabuTheme.colors.rule),
            )
            if (label == TeachViewModel.Label.Spent) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    categories.filter { it.parentId == null && it.kind == "spend" }.forEach { c ->
                        FilterChip(
                            selected = category == c.id, onClick = { category = if (category == c.id) null else c.id }, label = { Text(c.nameEn) }, shape = RoundedCornerShape(4.dp),
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = HesabuTheme.colors.biro, selectedLabelColor = HesabuTheme.colors.onBiro, containerColor = HesabuTheme.colors.paper, labelColor = HesabuTheme.colors.ink),
                            border = FilterChipDefaults.filterChipBorder(enabled = true, selected = category == c.id, borderColor = HesabuTheme.colors.rule, selectedBorderColor = HesabuTheme.colors.biro),
                        )
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryButton(stringResource(R.string.teach_save), { onLabel(item, label!!, cents!!, category) }, Modifier.weight(1f), enabled = label != null && cents != null && cents > 0)
            QuietButton(stringResource(R.string.teach_not_money), { onDismiss(item) })
        }
    }
}
