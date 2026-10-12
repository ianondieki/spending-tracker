package ke.hesabu.app.parse

import kotlin.math.abs

/**
 * Amount handling for parsed messages. Amounts are stored as integer minor units (cents) so that
 * sums are exact: "Numbers are computed, never generated" (master prompt §2).
 *
 * Accepts the amount formats seen in Kenyan money SMS, e.g. `Ksh1,234.50`, `KES 1,234`, `Ksh.250.00`,
 * `1234.5`. Rejects anything it cannot parse exactly rather than guessing.
 */
object Money {

    private val amountRegex = Regex("""^(?:KSHS?|KES)?\.?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$""")

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
        val a = abs(cents)
        return "${sign}KES ${group(a / 100)}.${(a % 100).toString().padStart(2, '0')}"
    }

    /**
     * The display format from the design tokens: `KSh 12,450`, negative `KSh -1,200`, no decimals in reports.
     * With [decimals] = 2 the cents are kept (`KSh 1,234.50`); with 0 they round half up on the absolute value.
     */
    fun formatKsh(cents: Long, decimals: Int = 0): String = "KSh ${formatPlain(cents, decimals)}"

    /** The number alone (`12,450`, `-1,200`, `1,234.50`), for places where the symbol sits elsewhere. */
    fun formatPlain(cents: Long, decimals: Int = 0): String {
        require(decimals == 0 || decimals == 2) { "decimals must be 0 or 2" }
        val sign = if (cents < 0) "-" else ""
        val a = abs(cents)
        return if (decimals == 2) {
            "$sign${group(a / 100)}.${(a % 100).toString().padStart(2, '0')}"
        } else {
            "$sign${group((a + 50) / 100)}"
        }
    }

    private fun group(whole: Long): String =
        whole.toString().reversed().chunked(3).joinToString(",").reversed()
}
