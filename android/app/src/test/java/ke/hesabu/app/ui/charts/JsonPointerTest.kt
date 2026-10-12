package ke.hesabu.app.ui.charts

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** RFC 6901 resolution over FactsSheet-shaped JSON, including the escapes and every way a pointer can miss. */
class JsonPointerTest {

    private val doc = Json.parseToJsonElement(
        """
        {
          "totals": {"fees": {"cents": 18700, "display": "KSh 187"}},
          "accounts": [{"label": "M-Pesa", "balance_series": [{"at": "t0", "cents": 1}, {"at": "t1", "cents": 2}]}],
          "a/b": 1, "m~n": 2, "": 3, "spaced key": 4, "nothing": null
        }
        """.trimIndent(),
    )

    @Test
    fun emptyPointerIsTheWholeDocument() {
        assertEquals(doc, JsonPointer.resolve(doc, ""))
    }

    @Test
    fun walksObjectsAndArrays() {
        assertEquals("KSh 187", JsonPointer.resolve(doc, "/totals/fees/display")!!.jsonPrimitive.content)
        assertTrue(JsonPointer.resolve(doc, "/accounts/0/balance_series") is JsonArray)
        assertEquals(JsonPrimitive(2), JsonPointer.resolve(doc, "/accounts/0/balance_series/1/cents"))
    }

    @Test
    fun unescapesTildeSequencesInOrder() {
        assertEquals(JsonPrimitive(1), JsonPointer.resolve(doc, "/a~1b"))
        assertEquals(JsonPrimitive(2), JsonPointer.resolve(doc, "/m~0n"))
        assertEquals(JsonPrimitive(3), JsonPointer.resolve(doc, "/"))
    }

    @Test
    fun acceptsTheUriFragmentForm() {
        assertEquals("KSh 187", JsonPointer.resolve(doc, "#/totals/fees/display")!!.jsonPrimitive.content)
        assertEquals(JsonPrimitive(4), JsonPointer.resolve(doc, "#/spaced%20key"))
    }

    @Test
    fun missesReturnNullNeverThrow() {
        listOf(
            "/missing", "/totals/fees/cents/deeper", "/accounts/1", "/accounts/-", "/accounts/01", "/accounts/x",
            "/accounts/99999999999", "totals", "/nothing", "#/bad%2", "#/bad%zz",
        ).forEach { assertNull(it, JsonPointer.resolve(doc, it)) }
        assertNull(JsonPointer.resolve(null, "/totals"))
        assertNull(JsonPointer.resolve(doc, null))
    }

    @Test
    fun parentAndLastToken() {
        assertEquals("/accounts/0", JsonPointer.parent("/accounts/0/balance_series"))
        assertEquals("/totals", JsonPointer.parent("/totals/fees"))
        assertEquals("", JsonPointer.parent("/categories"))
        assertEquals("fees", JsonPointer.lastToken("/totals/fees"))
        assertEquals("a/b", JsonPointer.lastToken("/a~1b"))
    }
}
