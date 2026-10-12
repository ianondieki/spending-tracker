package ke.hesabu.app.ui.charts

import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow

/**
 * Axis arithmetic for the bar charts: clean tick values (0, 2K, 4K, 6K) and compact tick labels. Ticks round to
 * whole shillings so a grid line never sits at a fraction of a shilling.
 */
object ChartScale {

    /**
     * Ticks in cents from 0 up to the first clean value at or above [maxCents], about [target] steps apart.
     * Steps are 1, 2, 2.5 or 5 times a power of ten shillings.
     */
    fun ticks(maxCents: Long, target: Int = 3): List<Long> {
        val maxShillings = ceil(maxCents.coerceAtLeast(0) / 100.0)
        if (maxShillings <= 0.0) return listOf(0L)
        val rough = maxShillings / target.coerceAtLeast(1)
        val magnitude = 10.0.pow(floor(log10(rough)))
        val normalised = rough / magnitude
        val factor = when {
            normalised <= 1.0 -> 1.0
            normalised <= 2.0 -> 2.0
            normalised <= 2.5 && magnitude >= 10.0 -> 2.5
            normalised <= 5.0 -> 5.0
            else -> 10.0
        }
        val step = (factor * magnitude).coerceAtLeast(1.0)
        val top = ceil(maxShillings / step) * step
        val count = (top / step).toInt()
        return (0..count).map { Math.round(it * step * 100) }
    }

    /** `0`, `750`, `2K`, `2.5K`, `12K`, `1.2M`: whole shillings, compact from a thousand up. */
    fun compact(cents: Long): String {
        val shillings = cents / 100.0
        val a = abs(shillings)
        return when {
            a < 1_000 -> Math.round(shillings).toString()
            a < 1_000_000 -> trim(shillings / 1_000) + "K"
            else -> trim(shillings / 1_000_000) + "M"
        }
    }

    private fun trim(v: Double): String {
        val rounded = Math.round(v * 10) / 10.0
        return if (rounded == floor(rounded)) rounded.toLong().toString() else String.format(Locale.ROOT, "%.1f", rounded)
    }
}
