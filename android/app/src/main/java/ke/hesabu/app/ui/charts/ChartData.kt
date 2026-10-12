package ke.hesabu.app.ui.charts

import androidx.compose.runtime.Immutable

/*
 * The data each Compose chart draws, already mapped from the FactsSheet by [ChartMappers]. Amounts are integer
 * cents, so every label is computed from the same numbers the bars and slices are drawn from.
 */

/** Everything a chart section can draw. */
sealed interface ChartData

/** One slice of the category donut. [slot] is the categorical colour slot; null marks the Other slice. */
@Immutable
data class DonutSlice(val name: String, val cents: Long, val sharePct: Int, val slot: Int?) {
    val isOther: Boolean get() = slot == null
}

/** `donut`: at most six slices, the last one Other when the tail was folded. [totalCents] is the centre figure. */
@Immutable
data class DonutData(val slices: List<DonutSlice>, val totalCents: Long) : ChartData

/** One day of `daily_bars`. [axisLabel] is the short label under the bar; blank when this bar is not labelled. */
@Immutable
data class DayBar(val label: String, val axisLabel: String, val cents: Long)

/** `daily_bars`: one bar per day, the average line, and the spendiest day (null when nothing was spent). */
@Immutable
data class DailyBarsData(val bars: List<DayBar>, val averageCents: Long, val spendiestIndex: Int?) : ChartData

/** One row of `top_bars` (a merchant or a person). */
@Immutable
data class RankedBar(val name: String, val cents: Long, val isNew: Boolean)

/** `top_bars`: sorted largest first, at most eight. */
@Immutable
data class TopBarsData(val items: List<RankedBar>) : ChartData

/**
 * `fee_meter`: the period's fees and their share of spending. [ratio] (0..1, unrounded) sizes the bar;
 * [ratioPct] is the whole percent the sheet displays.
 */
@Immutable
data class FeeMeterData(val feesCents: Long, val ratio: Double?, val ratioPct: Int?) : ChartData

/** One point of a balance line. [at] is the ISO time from the sheet. */
@Immutable
data class BalancePoint(val at: String, val cents: Long)

/** `balance_sparkline`: one account's balance through the period. */
@Immutable
data class SparklineData(val accountLabel: String?, val points: List<BalancePoint>) : ChartData {
    val last: BalancePoint get() = points.last()
    val minCents: Long get() = points.minOf { it.cents }
    val maxCents: Long get() = points.maxOf { it.cents }
}
