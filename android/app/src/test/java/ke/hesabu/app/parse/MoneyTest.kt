package ke.hesabu.app.parse

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Plain JUnit (no Android runtime): amounts are parsed exactly into cents and formatted back. */
class MoneyTest {

    @Test
    fun parsesMpesaStyleAmounts() {
        assertEquals(123_450L, Money.parseKesToCents("Ksh1,234.50"))
        assertEquals(123_400L, Money.parseKesToCents("KES 1,234"))
        assertEquals(25_000L, Money.parseKesToCents("Ksh.250.00"))
        assertEquals(123_450L, Money.parseKesToCents("1234.5"))
        assertEquals(5L, Money.parseKesToCents("0.05"))
    }

    @Test
    fun rejectsMalformedAmounts() {
        assertNull(Money.parseKesToCents(""))
        assertNull(Money.parseKesToCents("Ksh"))
        assertNull(Money.parseKesToCents("1,23.50"))
        assertNull(Money.parseKesToCents("12.345"))
        assertNull(Money.parseKesToCents("USD 10"))
    }

    @Test
    fun formatsCentsWithGroupingAndTwoDecimals() {
        assertEquals("KES 1,234.50", Money.formatKes(123_450L))
        assertEquals("KES 0.05", Money.formatKes(5L))
        assertEquals("KES 1,000,000.00", Money.formatKes(100_000_000L))
        assertEquals("-KES 250.00", Money.formatKes(-25_000L))
    }

    @Test
    fun roundTripsExactly() {
        val samples = listOf("Ksh1,234.50", "KES 99", "Ksh.0.99", "1,000,000")
        for (s in samples) {
            val cents = requireNotNull(Money.parseKesToCents(s)) { "could not parse $s" }
            assertEquals(cents, Money.parseKesToCents(Money.formatKes(cents).removePrefix("KES ")))
        }
    }
}
