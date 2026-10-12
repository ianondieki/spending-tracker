package ke.hesabu.app.parse.pack

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** The portable subset: forbidden constructs are rejected at load time, allowed ones compile case-insensitively. */
class PortableRegexTest {

    private fun rejects(p: String) {
        assertThrows(PortableRegex.PortableRegexException::class.java) { PortableRegex.compile(p) }
    }

    @Test
    fun rejectsForbiddenConstructs() {
        rejects("(?<=Ksh)\\d+")
        rejects("(?<!x)\\d+")
        rejects("(?=x)\\d+")
        rejects("(?i)ksh")
        rejects("\\p{L}+")
        rejects("(a)\\1")
        rejects("(?<a>x)\\k<a>")
        rejects("\\bKsh\\b")
        rejects("\\d++")
        rejects("(?<Amount>\\d+)")
        rejects("(?<1a>\\d+)")
        rejects("(unbalanced")
    }

    @Test
    fun allowsTheSubsetAndMatchesCaseInsensitively() {
        val c = PortableRegex.compile("^(?<ref>[A-Z0-9]{10}) confirmed\\. (?:you )?have (?<amount>Ksh[\\d,]+\\.\\d{2})(?<tail>.*?)$")
        assertEquals(listOf("ref", "amount", "tail"), c.groupNames)
        val m = c.find("QJK3X8Y2M1 Confirmed. You have Ksh1,200.00 now")!!
        assertEquals("QJK3X8Y2M1", m["ref"])
        assertEquals("Ksh1,200.00", m["amount"])
        assertEquals(" now", m["tail"])
    }

    @Test
    fun escapedCharactersAndClassesDoNotTriggerTheChecks() {
        // A literal "\b" inside a class or an escaped backslash followed by b is not a word boundary.
        PortableRegex.compile("[\\\\]b")
        PortableRegex.compile("\\(\\?<=\\)")
        PortableRegex.compile("[(?<=]")
    }

    @Test
    fun unmatchedOptionalGroupIsNull() {
        val c = PortableRegex.compile("a(?<b>b)?c")
        assertEquals(mapOf("b" to null), c.find("ac"))
    }
}
