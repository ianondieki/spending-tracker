package ke.hesabu.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/** Monday weeks in Africa/Nairobi; next report time from the schedule strings. */
class PeriodsTest {
    private val p = Periods()
    private val zone = ZoneId.of("Africa/Nairobi")
    // Wednesday 14 October 2026, 10:00 Nairobi
    private val now = ZonedDateTime.of(2026, 10, 14, 10, 0, 0, 0, zone).toInstant().toEpochMilli()

    @Test
    fun weekStartsOnMonday() {
        val w = p.thisWeek(now)
        assertEquals(LocalDate.of(2026, 10, 12), w.start)
        assertEquals(LocalDate.of(2026, 10, 18), w.endInclusive)
        assertEquals(ZonedDateTime.of(2026, 10, 12, 0, 0, 0, 0, zone).toInstant().toEpochMilli(), w.fromMillis)
        assertEquals(listOf(12, 13, 14), p.weekDaysSoFar(now).map { it.dayOfMonth })
        assertEquals(LocalDate.of(2026, 10, 5), p.lastWeek(now).start)
        assertEquals(LocalDate.of(2026, 10, 1), p.thisMonth(now).start)
    }

    @Test
    fun sundayBelongsToTheWeekThatStartedOnMonday() {
        val sunday = ZonedDateTime.of(2026, 10, 18, 23, 30, 0, 0, zone).toInstant().toEpochMilli()
        assertEquals(LocalDate.of(2026, 10, 12), p.thisWeek(sunday).start)
        assertEquals(7, p.weekDaysSoFar(sunday).size)
    }

    @Test
    fun nextReportFromScheduleStrings() {
        val next = p.nextReportAt("SUN 19:30", "1 07:30", now)!!
        assertEquals(ZonedDateTime.of(2026, 10, 18, 19, 30, 0, 0, zone), next)
        val nearMonthEnd = ZonedDateTime.of(2026, 10, 31, 12, 0, 0, 0, zone).toInstant().toEpochMilli()
        assertEquals(ZonedDateTime.of(2026, 11, 1, 7, 30, 0, 0, zone), p.nextReportAt("SUN 19:30", "1 07:30", nearMonthEnd))
        assertNull(p.nextReportAt("whenever", "soon", now))
    }

    @Test
    fun headersAndLabels() {
        assertEquals("Today", p.dayHeader(LocalDate.of(2026, 10, 14), now, "Today", "Yesterday"))
        assertEquals("Yesterday", p.dayHeader(LocalDate.of(2026, 10, 13), now, "Today", "Yesterday"))
        assertEquals("Mon 12 Oct", p.dayHeader(LocalDate.of(2026, 10, 12), now, "Today", "Yesterday"))
        assertEquals("Jumatatu", p.dayName(LocalDate.of(2026, 10, 12), "sw"))
        assertEquals("Wednesday", p.dayName(LocalDate.of(2026, 10, 14)))
        assertEquals("10:00 AM", p.timeOf(now))
    }
}
