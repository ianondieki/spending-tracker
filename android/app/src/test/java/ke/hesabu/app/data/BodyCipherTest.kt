package ke.hesabu.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class BodyCipherTest {
    @Test
    fun testCipherRoundTripsAndIsNotPlain() {
        val c = InsecureTestBodyCipher()
        val blob = c.encrypt("Ksh1,200.00 sent to X")
        assertNotEquals("Ksh1,200.00 sent to X", String(blob, Charsets.UTF_8))
        assertEquals("Ksh1,200.00 sent to X", c.decrypt(blob))
    }
}
