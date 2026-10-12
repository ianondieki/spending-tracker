package ke.hesabu.app.parse

/**
 * Amount handling for parsed messages. Amounts are stored as integer minor units (cents) so that
 * sums are exact: "Numbers are computed, never generated" (master prompt §2).
 *
 * Accepts the amount formats seen in Kenyan money SMS, e.g. `Ksh1,234.50`, `KES 1,234`, `Ksh.250.00`,
 * `1234.5`. Rejects anything it cannot parse exactly rather than guessing.
 */
object Money {

    private val amountRegex = Regex("""^(?:KSH|KES)?\.?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$""")

    /**
     * Parse a KES amount string into minor units (cents).
     * @return the amount in cents, or `null` when the text is not a well-formed amount.
     */
    fun parseKesToCents(text: String): Long? {
        val normalised = text.trim().uppercase()
        val match = amountRegex.matchEntire(normalised) ?: return null
        val whole = match.groupValues[1].replace(",", "").toLongOrNull() ?: return null
        val fraction = match.groupValues[2].padEnd(2, '0').toLongOrNull() ?: return null
        return whole * 100 + fraction
    }

    /** Format cents as `KES 1,234.50` (en-KE style, always two decimals). */
    fun formatKes(cents: Long): String {
        val sign = if (cents < 0) "-" else ""
        val abs = kotlin.math.abs(cents)
        val whole = (abs / 100).toString().reversed().chunked(3).joinToString(",").reversed()
        val fraction = (abs % 100).toString().padStart(2, '0')
        return "${sign}KES $whole.$fraction"
    }
}
