package ke.hesabu.app.ui

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/** Kenyan calendar rules: Africa/Nairobi, weeks start on Monday. Pure functions, unit-tested. */
class Periods(val zone: ZoneId = ZoneId.of("Africa/Nairobi"), private val weekStart: DayOfWeek = DayOfWeek.MONDAY) {

    data class Range(val fromMillis: Long, val toMillis: Long, val start: LocalDate, val endInclusive: LocalDate)

    fun today(nowMillis: Long): LocalDate = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()

    fun dayOf(millis: Long): LocalDate = Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()

    fun startOfDayMillis(d: LocalDate): Long = d.atStartOfDay(zone).toInstant().toEpochMilli()

    /** Monday 00:00 of the week containing [nowMillis] to the next Monday 00:00 (exclusive). */
    fun thisWeek(nowMillis: Long): Range {
        val t = today(nowMillis)
        val start = t.with(TemporalAdjusters.previousOrSame(weekStart))
        return Range(startOfDayMillis(start), startOfDayMillis(start.plusWeeks(1)), start, start.plusDays(6))
    }

    fun lastWeek(nowMillis: Long): Range {
        val w = thisWeek(nowMillis)
        return Range(startOfDayMillis(w.start.minusWeeks(1)), w.fromMillis, w.start.minusWeeks(1), w.start.minusDays(1))
    }

    fun thisMonth(nowMillis: Long): Range {
        val t = today(nowMillis).withDayOfMonth(1)
        return Range(startOfDayMillis(t), startOfDayMillis(t.plusMonths(1)), t, t.plusMonths(1).minusDays(1))
    }

    /** The days of the week up to and including today, for the Home tally. */
    fun weekDaysSoFar(nowMillis: Long): List<LocalDate> {
        val w = thisWeek(nowMillis)
        val t = today(nowMillis)
        return generateSequence(w.start) { it.plusDays(1) }.takeWhile { !it.isAfter(t) }.toList()
    }

    private val dayLabel = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH)
    private val shortDay = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
    private val time = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)
    private val dateTime = DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.ENGLISH)

    fun dayName(d: LocalDate, locale: String = "en"): String =
        if (locale == "sw") swahiliDay(d.dayOfWeek) else d.format(dayLabel)

    fun shortDate(d: LocalDate): String = d.format(shortDay)

    fun timeOf(millis: Long): String = Instant.ofEpochMilli(millis).atZone(zone).format(time)

    fun dateTimeOf(millis: Long): String = Instant.ofEpochMilli(millis).atZone(zone).format(dateTime)

    /** Header for a day group: Today, Yesterday, else "Mon 6 Oct". */
    fun dayHeader(d: LocalDate, nowMillis: Long, today: String, yesterday: String): String {
        val t = today(nowMillis)
        return when (d) {
            t -> today
            t.minusDays(1) -> yesterday
            else -> shortDate(d)
        }
    }

    /**
     * Next occurrence of a schedule like "SUN 19:30" (weekly) or "1 07:30" (monthly, day of month) after [nowMillis].
     * Returns null when the text is not understood.
     */
    fun nextReportAt(weeklyAt: String, monthlyAt: String, nowMillis: Long): ZonedDateTime? {
        val now = Instant.ofEpochMilli(nowMillis).atZone(zone)
        val weekly = parseWeekly(weeklyAt, now)
        val monthly = parseMonthly(monthlyAt, now)
        return listOfNotNull(weekly, monthly).minOrNull()
    }

    private fun parseWeekly(text: String, now: ZonedDateTime): ZonedDateTime? {
        val parts = text.trim().split(Regex("\\s+"))
        if (parts.size != 2) return null
        val dow = runCatching { DayOfWeek.valueOf(fullDayName(parts[0])) }.getOrNull() ?: return null
        val t = runCatching { LocalTime.parse(parts[1]) }.getOrNull() ?: return null
        var candidate = now.toLocalDate().with(TemporalAdjusters.nextOrSame(dow)).atTime(t).atZone(zone)
        if (!candidate.isAfter(now)) candidate = candidate.plusWeeks(1)
        return candidate
    }

    private fun parseMonthly(text: String, now: ZonedDateTime): ZonedDateTime? {
        val parts = text.trim().split(Regex("\\s+"))
        if (parts.size != 2) return null
        val day = parts[0].toIntOrNull()?.coerceIn(1, 28) ?: return null
        val t = runCatching { LocalTime.parse(parts[1]) }.getOrNull() ?: return null
        var candidate = LocalDateTime.of(now.toLocalDate().withDayOfMonth(day), t).atZone(zone)
        if (!candidate.isAfter(now)) candidate = candidate.plusMonths(1)
        return candidate
    }

    private fun fullDayName(abbr: String): String = when (abbr.uppercase().take(3)) {
        "MON" -> "MONDAY"; "TUE" -> "TUESDAY"; "WED" -> "WEDNESDAY"; "THU" -> "THURSDAY"
        "FRI" -> "FRIDAY"; "SAT" -> "SATURDAY"; "SUN" -> "SUNDAY"; else -> abbr.uppercase()
    }

    private fun swahiliDay(d: DayOfWeek) = when (d) {
        DayOfWeek.MONDAY -> "Jumatatu"; DayOfWeek.TUESDAY -> "Jumanne"; DayOfWeek.WEDNESDAY -> "Jumatano"
        DayOfWeek.THURSDAY -> "Alhamisi"; DayOfWeek.FRIDAY -> "Ijumaa"; DayOfWeek.SATURDAY -> "Jumamosi"; DayOfWeek.SUNDAY -> "Jumapili"
    }
}
