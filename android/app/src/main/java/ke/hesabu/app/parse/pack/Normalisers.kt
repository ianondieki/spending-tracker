package ke.hesabu.app.parse.pack

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.ResolverStyle
import java.time.temporal.ChronoField
import java.time.temporal.TemporalAccessor
import java.util.Locale

/**
 * The six normalisers from PROVIDER-PACKS.md §4. Each returns null when the text cannot be normalised exactly;
 * the engine then treats the family as failed rather than guessing.
 */
object Normalisers {

    val NAIROBI: ZoneId = ZoneId.of("Africa/Nairobi")
    private val OFFSET: ZoneOffset = ZoneOffset.ofHours(3)
    private val ISO_OUT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx")
    private val amountShape = Regex("""^(\d+)(?:\.(\d{1,2}))?$""")

    /**
     * `Ksh1,200.00` → 120000; `KES 50` → 5000. Strips any of [prefixes] (case-insensitive), commas and spaces,
     * then parses a decimal with up to two places into cents.
     */
    fun amount(raw: String, prefixes: List<String>): Long? {
        var s = raw.trim()
        // Longest prefix first so "Kshs" is removed before "Ksh".
        for (p in prefixes.sortedByDescending { it.length }) {
            if (p.isNotEmpty() && s.regionMatches(0, p, 0, p.length, ignoreCase = true)) {
                s = s.substring(p.length)
                break
            }
        }
        s = s.replace(",", "").replace(" ", "").trimStart('.').trim()
        val m = amountShape.matchEntire(s) ?: return null
        val whole = m.groupValues[1].toLongOrNull() ?: return null
        val frac = m.groupValues[2].padEnd(2, '0').toLong()
        return whole * 100 + frac
    }

    /** Tries each pack format in order; the first that parses wins. Output is ISO 8601 with +03:00. */
    fun datetime(raw: String, formats: List<String>): String? {
        val text = raw.trim().replace(Regex("\\s+"), " ")
        for (f in formats) {
            val parsed = parseWith(text, f) ?: continue
            return OffsetDateTime.of(parsed, OFFSET).format(ISO_OUT)
        }
        return null
    }

    /** Epoch millis of an ISO string produced by [datetime]. */
    fun isoToEpochMillis(iso: String): Long = OffsetDateTime.parse(iso).toInstant().toEpochMilli()

    fun epochMillisToIso(millis: Long): String =
        OffsetDateTime.ofInstant(java.time.Instant.ofEpochMilli(millis), OFFSET).format(ISO_OUT)

    private val formatterCache = HashMap<String, DateTimeFormatter?>()

    private fun formatter(pattern: String): DateTimeFormatter? = synchronized(formatterCache) {
        formatterCache.getOrPut(pattern) {
            runCatching {
                // Strict resolution rejects 31 February; strict mode needs proleptic years ('u'), so map 'y' to 'u'
                // outside quoted literals. Two-digit years still resolve to 2000 to 2099.
                DateTimeFormatterBuilder()
                    .parseCaseInsensitive()
                    .appendPattern(yearsToProleptic(pattern))
                    .toFormatter(Locale.ENGLISH)
                    .withResolverStyle(ResolverStyle.STRICT)
            }.getOrNull()
        }
    }

    private fun yearsToProleptic(pattern: String): String {
        val sb = StringBuilder()
        var quoted = false
        for (c in pattern) {
            if (c == '\'') quoted = !quoted
            sb.append(if (c == 'y' && !quoted) 'u' else c)
        }
        return sb.toString()
    }

    private fun parseWith(text: String, pattern: String): LocalDateTime? {
        val fmt = formatter(pattern) ?: return null
        val t: TemporalAccessor = runCatching { fmt.parse(text) }.getOrNull() ?: return null
        val date = runCatching { LocalDate.from(t) }.getOrNull() ?: return null
        val time = when {
            t.isSupported(ChronoField.HOUR_OF_DAY) -> LocalTime.of(
                t.get(ChronoField.HOUR_OF_DAY),
                if (t.isSupported(ChronoField.MINUTE_OF_HOUR)) t.get(ChronoField.MINUTE_OF_HOUR) else 0,
                if (t.isSupported(ChronoField.SECOND_OF_MINUTE)) t.get(ChronoField.SECOND_OF_MINUTE) else 0,
            )
            else -> LocalTime.MIDNIGHT
        }
        return LocalDateTime.of(date, time)
    }

    /** Trim and collapse internal whitespace; keep case. */
    fun text(raw: String): String = raw.trim().replace(Regex("\\s+"), " ")

    /**
     * Keep digits, turn a leading `254` (from `+254` or `254`) into `0`, then mask to the first 2 and last 3
     * digits: `+254 712 345678` → `07XXXXX678`. Short strings (under 6 digits) are masked wholesale.
     */
    fun phone(raw: String): String? {
        var d = raw.filter { it.isDigit() }
        if (d.isEmpty()) return null
        if (d.startsWith("254") && d.length >= 12) d = "0" + d.substring(3)
        return mask(d)
    }

    fun mask(digits: String): String {
        if (digits.length < 6) return "X".repeat(digits.length)
        return digits.take(2) + "X".repeat(digits.length - 5) + digits.takeLast(3)
    }

    /** Upper-case alphanumerics, trimmed. */
    fun code(raw: String): String? {
        val c = raw.trim().uppercase().filter { it.isLetterOrDigit() }
        return c.ifEmpty { null }
    }

    /** Digits only. */
    fun digits(raw: String): String? = raw.filter { it.isDigit() }.ifEmpty { null }

    /** A paybill account number that looks like a phone or national ID (7+ digits) is masked before storage. */
    fun accountRef(raw: String): String {
        val t = text(raw)
        val d = t.filter { it.isDigit() }
        return if (d.length >= 7 && d.length == t.replace(" ", "").replace("+", "").length) mask(if (d.startsWith("254") && d.length >= 12) "0" + d.substring(3) else d) else t
    }
}
