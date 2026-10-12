package ke.hesabu.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ke.hesabu.app.AppGraph
import ke.hesabu.app.data.AccountEntity
import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.ui.Periods
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZonedDateTime

/** Home: this week's tally, accounts, unknowns badge, next report time. Everything is computed from the ledger. */
class HomeViewModel(private val graph: AppGraph, private val now: () -> Long = System::currentTimeMillis) : ViewModel() {

    data class DayRow(val day: LocalDate, val cents: Long, val count: Int)

    data class State(
        val loading: Boolean = true,
        val ledgerEmpty: Boolean = true,
        val days: List<DayRow> = emptyList(),
        val weekOutCents: Long = 0,
        val weekInCents: Long = 0,
        val weekFeeCents: Long = 0,
        val lastWeekOutCents: Long? = null,
        val accounts: List<AccountEntity> = emptyList(),
        val unknownCount: Int = 0,
        val recent: List<TransactionEntity> = emptyList(),
        val nextReportAt: ZonedDateTime? = null,
        val settings: AppSettings = AppSettings(),
        val weekStart: LocalDate = LocalDate.MIN,
        val syncQueued: Int = 0,
    )

    private val periods = Periods()

    val state: StateFlow<State> = graph.settings.settings.flatMapLatest { settings ->
        val p = Periods(java.time.ZoneId.of(settings.timeZone))
        val week = p.thisWeek(now())
        val last = p.lastWeek(now())
        combine(
            graph.db.transactionDao().observeBetween(last.fromMillis, week.toMillis),
            graph.db.accountDao().observeAll(),
            graph.db.unknownMessageDao().observePendingCount(),
            graph.db.transactionDao().observeCount(),
            graph.db.syncQueueDao().observeCount(),
        ) { rows, accounts, unknown, total, queued ->
            val thisWeek = rows.filter { it.occurredAtMillis >= week.fromMillis }
            val lastWeek = rows.filter { it.occurredAtMillis < week.fromMillis }
            val spend = thisWeek.filter { it.direction == "out" && !it.isTransfer }
            val byDay = spend.groupBy { p.dayOf(it.occurredAtMillis) }
            val days = p.weekDaysSoFar(now()).map { d -> DayRow(d, byDay[d]?.sumOf { it.amountCents } ?: 0, byDay[d]?.size ?: 0) }
            State(
                loading = false,
                ledgerEmpty = total == 0,
                days = days,
                weekOutCents = spend.sumOf { it.amountCents },
                weekInCents = thisWeek.filter { it.direction == "in" && !it.isTransfer }.sumOf { it.amountCents },
                weekFeeCents = thisWeek.sumOf { it.feeCents },
                lastWeekOutCents = if (lastWeek.isEmpty()) null else lastWeek.filter { it.direction == "out" && !it.isTransfer }.sumOf { it.amountCents },
                accounts = accounts,
                unknownCount = unknown,
                recent = thisWeek.sortedByDescending { it.occurredAtMillis }.take(5),
                nextReportAt = settings.nextReportAt?.let { runCatching { ZonedDateTime.parse(it).withZoneSameInstant(p.zone) }.getOrNull() }
                    ?: p.nextReportAt(settings.weeklyAt, settings.monthlyAt, now()),
                settings = settings,
                weekStart = week.start,
                syncQueued = queued,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), State())

    init {
        viewModelScope.launch { graph.ensureTaxonomy() }
    }
}
