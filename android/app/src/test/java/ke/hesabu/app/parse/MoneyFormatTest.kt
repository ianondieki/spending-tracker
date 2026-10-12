package ke.hesabu.app.parse

import org.junit.Assert.assertEquals
import org.junit.Test

/** The display format from contracts/design-tokens.json: `KSh 12,450`, `KSh -1,200`, no decimals in reports. */
class MoneyFormatTest {

    @Test
    fun formatsWholeShillingsWithThousandsGroups() {
        assertEquals("KSh 12,450", Money.formatKsh(1_245_000))
        assertEquals("KSh 0", Money.formatKsh(0))
        assertEquals("KSh 5", Money.formatKsh(500))
        assertEquals("KSh 1,234,567", Money.formatKsh(123_456_700))
    }

    @Test
    fun negativeSignSitsAfterTheSymbol() {
        assertEquals("KSh -1,200", Money.formatKsh(-120_000))
    }

    @Test
    fun zeroDecimalsRoundHalfUpOnTheAbsoluteValue() {
        assertEquals("KSh 13", Money.formatKsh(1_250))
        assertEquals("KSh 12", Money.formatKsh(1_249))
        assertEquals("KSh -13", Money.formatKsh(-1_250))
    }

    @Test
    fun twoDecimalsKeepTheCents() {
        assertEquals("KSh 1,234.50", Money.formatKsh(123_450, decimals = 2))
        assertEquals("KSh 0.05", Money.formatKsh(5, decimals = 2))
    }

    @Test
    fun plainNumberHasNoSymbol() {
        assertEquals("12,450", Money.formatPlain(1_245_000))
        assertEquals("-1,200", Money.formatPlain(-120_000))
    }

    @Test
    fun parsesKshsVariant() {
        assertEquals(120_000L, Money.parseKesToCents("Kshs1,200.00"))
    }
}
