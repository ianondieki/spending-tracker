package ke.hesabu.app.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ke.hesabu.app.AppGraph
import ke.hesabu.app.data.AccountEntity
import ke.hesabu.app.data.CategoryEntity
import ke.hesabu.app.data.SyncQueueEntity
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.data.UserRuleEntity
import ke.hesabu.app.ui.Periods
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

/** Transactions: a filtered, searchable ledger grouped by day with running totals, plus the detail-sheet edits. */
class TransactionsViewModel(private val graph: AppGraph, private val now: () -> Long = System::currentTimeMillis) : ViewModel() {

    data class Filters(
        val query: String = "",
        val accountRef: String? = null,
        val categoryId: String? = null,
        val type: String? = null,
        val direction: String? = null,
        val includeTransfers: Boolean = true,
        val period: Period = Period.All,
    ) {
        val active: Int get() = listOfNotNull(accountRef, categoryId, type, direction).size + (if (!includeTransfers) 1 else 0) + (if (period != Period.All) 1 else 0)
    }

    enum class Period { All, ThisWeek, LastWeek, ThisMonth }

    data class DayGroup(val day: LocalDate, val rows: List<TransactionEntity>, val dayOutCents: Long, val runningOutCents: Long)

    data class State(
        val loading: Boolean = true,
        val groups: List<DayGroup> = emptyList(),
        val totalOutCents: Long = 0,
        val totalInCents: Long = 0,
        val count: Int = 0,
        val filters: Filters = Filters(),
        val accounts: List<AccountEntity> = emptyList(),
        val categories: List<CategoryEntity> = emptyList(),
        val timeZone: String = "Africa/Nairobi",
        val ledgerEmpty: Boolean = true,
    )

    val filters = MutableStateFlow(Filters())

    val state: StateFlow<State> = combine(filters.debounce(150), graph.settings.settings) { f, s -> f to s }
        .flatMapLatest { (f, settings) ->
            val p = Periods(java.time.ZoneId.of(settings.timeZone))
            val range = when (f.period) {
                Period.All -> 0L to Long.MAX_VALUE
                Period.ThisWeek -> p.thisWeek(now()).let { it.fromMillis to it.toMillis }
                Period.LastWeek -> p.lastWeek(now()).let { it.fromMillis to it.toMillis }
                Period.ThisMonth -> p.thisMonth(now()).let { it.fromMillis to it.toMillis }
            }
            combine(
                graph.db.transactionDao().observeFiltered(f.accountRef, f.categoryId, f.type, f.query.trim(), range.first, range.second),
                graph.db.accountDao().observeAll(),
                graph.db.categoryDao().observeAll(),
                graph.db.transactionDao().observeCount(),
            ) { rows, accounts, categories, total ->
                val visible = rows.filter { (f.direction == null || it.direction == f.direction) && (f.includeTransfers || !it.isTransfer) }
                // Rows arrive newest first; the running total is the spend from the oldest visible day up to each day.
                val byDay = visible.groupBy { p.dayOf(it.occurredAtMillis) }.toSortedMap()
                var running = 0L
                val groupsAsc = byDay.map { (day, list) ->
                    val out = list.filter { it.direction == "out" && !it.isTransfer }.sumOf { it.amountCents }
                    running += out
                    DayGroup(day, list.sortedByDescending { it.occurredAtMillis }, out, running)
                }
                State(
                    loading = false,
                    groups = groupsAsc.reversed(),
                    totalOutCents = visible.filter { it.direction == "out" && !it.isTransfer }.sumOf { it.amountCents },
                    totalInCents = visible.filter { it.direction == "in" && !it.isTransfer }.sumOf { it.amountCents },
                    count = visible.size,
                    filters = f,
                    accounts = accounts,
                    categories = categories,
                    timeZone = settings.timeZone,
                    ledgerEmpty = total == 0,
                )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), State())

    fun setQuery(q: String) = filters.update { it.copy(query = q) }
    fun setFilters(f: Filters) { filters.value = f }
    fun clearFilters() = filters.update { Filters(query = it.query) }

    fun observe(id: String) = graph.db.transactionDao().observeById(id)

    /** Change the category; optionally remember it as a rule for this counterparty ("Teach Hesabu"). */
    fun setCategory(tx: TransactionEntity, categoryId: String?, remember: Boolean) = viewModelScope.launch {
        val t = now()
        graph.db.transactionDao().update(tx.copy(categoryId = categoryId, categorySource = if (categoryId == null) "none" else "user", categoryConfidence = 1.0, userEdited = true, updatedAtMillis = t, syncedAtMillis = null))
        graph.db.syncQueueDao().upsert(SyncQueueEntity(tx.id, t))
        if (remember && categoryId != null) {
            val (kind, value) = when {
                tx.till != null -> "till" to tx.till
                tx.paybill != null -> "paybill" to tx.paybill
                tx.counterpartyName != null -> "name" to tx.counterpartyName
                else -> "type" to tx.type
            }
            graph.db.userRuleDao().upsert(UserRuleEntity(UUID.randomUUID().toString(), kind, ke.hesabu.app.data.Categoriser.normalise(value, kind), categoryId, createdAtMillis = t))
        }
    }

    fun setTransfer(tx: TransactionEntity, isTransfer: Boolean) = viewModelScope.launch {
        val t = now()
        graph.db.transactionDao().update(tx.copy(isTransfer = isTransfer, transferPairId = if (isTransfer) tx.transferPairId else null, userEdited = true, updatedAtMillis = t, syncedAtMillis = null))
        graph.db.syncQueueDao().upsert(SyncQueueEntity(tx.id, t))
    }

    fun setNote(tx: TransactionEntity, note: String) = viewModelScope.launch {
        val t = now()
        graph.db.transactionDao().update(tx.copy(note = note.trim().take(500).ifEmpty { null }, userEdited = true, updatedAtMillis = t, syncedAtMillis = null))
        graph.db.syncQueueDao().upsert(SyncQueueEntity(tx.id, t))
    }
}
