package ke.hesabu.app.parse.pack

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** PROVIDER-PACKS.md §4. */
class NormalisersTest {

    private val prefixes = listOf("Ksh", "KES", "KSh", "Kshs")

    @Test
    fun amountStripsPrefixesCommasAndSpaces() {
        assertEquals(120_000L, Normalisers.amount("Ksh1,200.00", prefixes))
        assertEquals(5_000L, Normalisers.amount("KES 50", prefixes))
        assertEquals(5_050L, Normalisers.amount("Kshs 50.5", prefixes))
        assertEquals(123_456_789L, Normalisers.amount("ksh 1,234,567.89", prefixes))
        assertEquals(25_000L, Normalisers.amount("Ksh.250.00", prefixes))
    }

    @Test
    fun amountRejectsWhatItCannotParseExactly() {
        assertNull(Normalisers.amount("Ksh", prefixes))
        assertNull(Normalisers.amount("12.345", prefixes))
        assertNull(Normalisers.amount("USD 10", prefixes))
        assertNull(Normalisers.amount("", prefixes))
    }

    @Test
    fun datetimeTriesFormatsInOrderInNairobiWithTwoDigitYears() {
        val formats = listOf("d/M/yy 'at' h:mm a", "yyyy-MM-dd HH:mm", "d MMM yyyy")
        assertEquals("2026-10-12T14:45:00+03:00", Normalisers.datetime("12/10/26 at 2:45 PM", formats))
        assertEquals("2026-10-12T00:05:00+03:00", Normalisers.datetime("12/10/26 at 12:05 am", formats))
        assertEquals("2026-10-12T12:05:00+03:00", Normalisers.datetime("12/10/26 at 12:05 PM", formats))
        assertEquals("2024-02-29T23:59:00+03:00", Normalisers.datetime("2024-02-29 23:59", formats))
        assertEquals("2026-03-05T00:00:00+03:00", Normalisers.datetime("5 Mar 2026", formats))
        assertEquals("2099-01-01T01:00:00+03:00", Normalisers.datetime("1/1/99 at 1:00 AM", formats))
        assertNull(Normalisers.datetime("31/02/26 at 2:45 PM", formats))
        assertNull(Normalisers.datetime("yesterday", formats))
    }

    @Test
    fun isoRoundTrip() {
        val iso = "2026-10-12T14:45:00+03:00"
        assertEquals(iso, Normalisers.epochMillisToIso(Normalisers.isoToEpochMillis(iso)))
    }

    @Test
    fun textTrimsAndCollapsesWhitespaceKeepingCase() {
        assertEquals("Jane W Kamau", Normalisers.text("  Jane   W\tKamau \n"))
    }

    @Test
    fun phoneNormalisesCountryCodeAndMasks() {
        assertEquals("07XXXXX678", Normalisers.phone("0712 345678"))
        assertEquals("07XXXXX678", Normalisers.phone("+254712345678"))
        assertEquals("07XXXXX678", Normalisers.phone("254 712 345678"))
        assertEquals("01XXXXX678", Normalisers.phone("0112345678"))
        assertEquals("XXXXX", Normalisers.phone("12345"))
        assertNull(Normalisers.phone("no digits"))
    }

    @Test
    fun codeAndDigits() {
        assertEquals("QJK3X8Y2M1", Normalisers.code(" qjk3x8y2m1 "))
        assertEquals("247247", Normalisers.digits("Paybill 247247."))
        assertNull(Normalisers.digits("none"))
    }

    @Test
    fun accountRefMasksOnlyWhenItLooksLikeAPhoneOrId() {
        assertEquals("07XXXXX678", Normalisers.accountRef("0712345678"))
        assertEquals("12XXXXXX901", Normalisers.accountRef("12345678901"))
        assertEquals("HSE-4B", Normalisers.accountRef("HSE-4B"))
        assertEquals("1234", Normalisers.accountRef("1234"))
    }
}
