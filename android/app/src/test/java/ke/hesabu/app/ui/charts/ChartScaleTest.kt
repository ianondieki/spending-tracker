package ke.hesabu.app.ui.charts

import org.junit.Assert.assertEquals
import org.junit.Test

/** Clean ticks and compact tick labels for the bar charts. */
class ChartScaleTest {

    @Test
    fun ticksStepByCleanValuesAndCoverTheMaximum() {
        assertEquals(listOf(0L, 200_000L, 400_000L, 600_000L), ChartScale.ticks(496_500))
        assertEquals(listOf(0L, 50_000L, 100_000L, 150_000L), ChartScale.ticks(150_000))
        assertEquals(listOf(0L), ChartScale.ticks(0))
        assertEquals(listOf(0L, 100L), ChartScale.ticks(50))
        ChartScale.ticks(123_456_789).let { assertEquals(true, it.last() >= 123_456_789) }
    }

    @Test
    fun compactLabels() {
        assertEquals("0", ChartScale.compact(0))
        assertEquals("750", ChartScale.compact(75_000))
        assertEquals("2K", ChartScale.compact(200_000))
        assertEquals("2.5K", ChartScale.compact(250_000))
        assertEquals("12K", ChartScale.compact(1_200_000))
        assertEquals("1.2M", ChartScale.compact(120_000_000))
    }
}
