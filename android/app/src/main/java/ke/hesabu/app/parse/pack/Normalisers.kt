package ke.hesabu.app.parse.pack

import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/**
 * The six normalisers from PROVIDER-PACKS.md §4, mirroring packages/pack-engine/src/normalise.ts line for line so
 * both engines produce byte-identical output (corpus/expected). Each returns null when the text cannot be
 * normalised exactly; the engine then treats the family as failed rather than guessing.
 */
object Normalisers {

    val NAIROBI: ZoneId = ZoneId.of("Africa/Nairobi")
    private val OFFSET: ZoneOffset = ZoneOffset.ofHours(3)
    private val ISO_OUT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx")
    private val amountShape = Regex("""^(\d+)(?:\.(\d{1,2}))?$""")
    private val whitespace = Regex("\\s+")

    /** Strips one prefix (longest first, case-insensitive), then commas and whitespace; at most two decimals. */
    fun amount(raw: String, prefixes: List<String>): Long? {
        var s = raw.trim()
        val lower = s.lowercase()
        for (p in prefixes.sortedByDescending { it.length }) {
            if (p.isNotEmpty() && lower.startsWith(p.lowercase())) {
                s = s.substring(p.length)
                break
            }
        }
        s = s.replace(Regex("[,\\s]+"), "")
        val m = amountShape.matchEntire(s) ?: return null
        val whole = m.groupValues[1].toLongOrNull() ?: return null
        val frac = m.groupValues[2].padEnd(2, '0').toLong()
        val cents = whole * 100 + frac
        return if (cents > 9_007_199_254_740_991L || cents < 0) null else cents
    }

    /** Tries each pack format in order; the first that parses wins. Output is ISO 8601 with +03:00. */
    fun datetime(raw: String, formats: List<String>): String? {
        val text = raw.replace(whitespace, " ").trim()
        for (f in formats) {
            val compiled = DatetimeFormat.compile(f) ?: continue
            val result = compiled.parse(text) ?: continue
            return result
        }
        return null
    }

    fun isoToEpochMillis(iso: String): Long = OffsetDateTime.parse(iso).toInstant().toEpochMilli()

    fun epochMillisToIso(millis: Long): String =
        OffsetDateTime.ofInstant(java.time.Instant.ofEpochMilli(millis), OFFSET).format(ISO_OUT)

    /** Collapse whitespace, trim; keep case. Null when empty. */
    fun text(raw: String): String? = raw.replace(whitespace, " ").trim().ifEmpty { null }

    /**
     * Keeps digits and the masking placeholders `X` and `*` a redacted or provider-masked number already carries
     * (`*` becomes `X`), turns a leading `254` into `0`, then masks to the first 2 and last 3 characters. Five
     * characters or fewer are returned unmasked.
     */
    fun phone(raw: String): String? {
        var t = raw.filter { it.isDigit() || it == 'X' || it == 'x' || it == '*' }.replace('x', 'X').replace('*', 'X')
        if (t.isEmpty()) return null
        if (t.startsWith("254")) t = "0" + t.substring(3)
        return maskMiddle(t)
    }

    fun maskMiddle(text: String): String =
        if (text.length <= 5) text else text.take(2) + "X".repeat(text.length - 5) + text.takeLast(3)

    /** Upper-case; must be alphanumeric only, else null. */
    fun code(raw: String): String? {
        val c = raw.trim().uppercase()
        return if (c.isNotEmpty() && c.all { it in 'A'..'Z' || it in '0'..'9' }) c else null
    }

    /** Digits only. */
    fun digits(raw: String): String? = raw.filter { it.isDigit() }.ifEmpty { null }

    /** A paybill account reference that looks like a phone is masked as one; any run of six or more digits keeps its last three. */
    fun accountRef(text: String): String {
        val compact = text.replace(whitespace, "")
        if (Regex("""^(?:\+?254|0)\d{9}$""").matches(compact)) return phone(compact) ?: text
        return Regex("""\d{6,}""").replace(text) { m -> "X".repeat(m.value.length - 3) + m.value.takeLast(3) }
    }

    /** Backwards-compatible alias used by the engine for the `account_ref` field. */
    fun maskAccountRef(text: String): String = accountRef(text)
}

/**
 * The datetime format mini-language both engines share: tokens d dd M MM MMM yy yyyy H HH h hh mm a, single-quoted
 * literals, a space matching any whitespace run, case-insensitive, anchored. Mirrors compileDatetimeFormat in the
 * TypeScript engine, including its validation (31/2/26 fails, 12-hour clocks need AM/PM).
 */
class DatetimeFormat private constructor(private val regex: Regex, private val tokens: List<String>) {

    fun parse(text: String): String? {
        val m = regex.matchEntire(text) ?: return null
        val p = HashMap<String, String>()
        tokens.forEachIndexed { i, t -> p[t] = m.groupValues[i + 1] }
        val day = (p["d"] ?: p["dd"])?.toIntOrNull() ?: return null
        val month = when {
            p["MMM"] != null -> MONTHS.indexOf(p["MMM"]!!.lowercase()).takeIf { it >= 0 }?.plus(1) ?: return null
            else -> (p["M"] ?: p["MM"])?.toIntOrNull() ?: return null
        }
        val year = when {
            p["yyyy"] != null -> p["yyyy"]!!.toInt()
            p["yy"] != null -> 2000 + p["yy"]!!.toInt()
            else -> return null
        }
        var hour = 0
        if (p["H"] != null || p["HH"] != null) {
            hour = (p["H"] ?: p["HH"])!!.toInt()
        } else if (p["h"] != null || p["hh"] != null) {
            hour = (p["h"] ?: p["hh"])!!.toInt()
            if (hour < 1 || hour > 12) return null
            val a = p["a"] ?: return null
            hour = (hour % 12) + if (a.uppercase().startsWith("P")) 12 else 0
        }
        val minute = p["mm"]?.toInt() ?: 0
        if (hour > 23 || minute > 59) return null
        if (month !in 1..12 || day < 1 || day > YearMonth.of(year, month).lengthOfMonth()) return null
        return "%04d-%02d-%02dT%02d:%02d:00+03:00".format(year, month, day, hour, minute)
    }

    companion object {
        private val MONTHS = listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
        private val TOKEN_REGEX = mapOf(
            "d" to "(\\d{1,2})", "dd" to "(\\d{2})", "M" to "(\\d{1,2})", "MM" to "(\\d{2})", "MMM" to "([A-Za-z]{3})",
            "yy" to "(\\d{2})", "yyyy" to "(\\d{4})", "H" to "(\\d{1,2})", "HH" to "(\\d{2})", "h" to "(\\d{1,2})",
            "hh" to "(\\d{2})", "mm" to "(\\d{2})", "a" to "(AM|PM|A\\.M\\.|P\\.M\\.)",
        )
        private val TOKENS = listOf("yyyy", "MMM", "MM", "HH", "hh", "mm", "dd", "yy", "d", "M", "H", "h", "a")
        private val cache = HashMap<String, DatetimeFormat?>()

        fun compile(format: String): DatetimeFormat? = synchronized(cache) { cache.getOrPut(format) { runCatching { build(format) }.getOrNull() } }

        private fun escapeLiteral(text: String): String =
            text.replace(Regex("""[.*+?^${'$'}{}()|\[\]\\/]""")) { "\\" + it.value }.replace(" ", "\\s+")

        private fun build(format: String): DatetimeFormat {
            val tokens = ArrayList<String>()
            val out = StringBuilder("^")
            var i = 0
            while (i < format.length) {
                val c = format[i]
                if (c == '\'') {
                    val close = format.indexOf('\'', i + 1)
                    require(close >= 0) { "unterminated quote in datetime format \"$format\"" }
                    out.append(escapeLiteral(format.substring(i + 1, close)))
                    i = close + 1
                    continue
                }
                if (c == ' ') { out.append("\\s+"); i++; continue }
                val token = TOKENS.firstOrNull { format.startsWith(it, i) }
                if (token != null) {
                    tokens.add(token)
                    out.append(TOKEN_REGEX[token])
                    i += token.length
                    continue
                }
                require(!c.isLetter()) { "unknown token \"$c\" in datetime format \"$format\"; quote literals" }
                out.append(escapeLiteral(c.toString()))
                i++
            }
            out.append("$")
            return DatetimeFormat(Regex(out.toString(), RegexOption.IGNORE_CASE), tokens)
        }
    }
}
