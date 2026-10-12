package ke.hesabu.app.data

import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.ParseResult
import ke.hesabu.app.parse.pack.TestPacks
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CategoriserTest {

    private val engine = PackEngine(TestPacks.builtinPacks())
    private fun parse(body: String) = (engine.parse(InboundMessage("MPESA", body, 0)) as ParseResult.Parsed).transaction

    private val naivas = parse("QJK3X8Y2M4 Confirmed. Ksh450.00 paid to NAIVAS WESTLANDS. on 12/10/26 at 1:20 PM.New M-PESA balance is Ksh3,650.00. Transaction cost, Ksh0.00.")
    private val kplc = parse("QJK3X8Y2M3 Confirmed. Ksh1,850.00 sent to KPLC PREPAID for account 12345678901 on 12/10/26 at 7:02 PM. New M-PESA balance is Ksh4,100.00. Transaction cost, Ksh0.00.")

    @Test
    fun resolutionOrderIsRuleSeedDefaultNone() {
        val seeds = listOf(MerchantSeedEntity("s", "name", "naivas", "Naivas", "groceries", 0.9), MerchantSeedEntity("t", "type", "PAYBILL", null, "utilities", 0.5))
        val rules = listOf(UserRuleEntity("r", "name", "naivas westlands", "shopping", createdAtMillis = 0))
        val c = Categoriser(rules, seeds)
        assertEquals(Categoriser.Resolution("shopping", "user", 1.0), c.resolve(naivas))
        assertEquals(Categoriser.Resolution("utilities", "merchant", 0.5), c.resolve(kplc))

        val noRules = Categoriser(emptyList(), seeds.take(1))
        val r = noRules.resolve(naivas)
        assertEquals("groceries", r.categoryId)
        assertEquals("merchant", r.source)
        assertTrue(r.confidence < 0.9) // prefix match, slightly less sure
        assertEquals(Categoriser.Resolution(null, "none", 0.0), noRules.resolve(kplc))

        val airtime = parse("QJK3X8Y2M7 Confirmed.You bought Ksh100.00 of airtime on 12/10/26 at 8:00 AM.New M-PESA balance is Ksh6,550.00. Transaction cost, Ksh0.00.")
        assertEquals(Categoriser.Resolution("airtime_data", "provider_default", 0.6), noRules.resolve(airtime))
    }

    @Test
    fun keysNormaliseByKind() {
        assertEquals("name:kplc prepaid", Categoriser.key("name", "  KPLC   Prepaid "))
        assertEquals("paybill:888880", Categoriser.key("paybill", "888-880"))
        assertEquals("type:PAYBILL", Categoriser.key("type", "paybill"))
    }

    @Test
    fun builtinTaxonomyLoadsAndCoversEverySeedCategory() {
        val file = TestPacks.moduleDir.resolve("src/main/assets/taxonomy-builtin/taxonomy.json")
        val loaded = Taxonomy.parseAll(listOf(file.readText()), fromContracts = false)
        assertNotNull(loaded)
        val ids = loaded!!.categories.map { it.id }.toSet()
        assertTrue(ids.containsAll(listOf("groceries", "cash", "transfers", "fees", "airtime_data")))
        loaded.seeds.forEach { assertTrue("seed ${it.id} points at unknown category ${it.categoryId}", it.categoryId in ids) }
        // Every pack default category must exist in the taxonomy.
        TestPacks.builtinPacks().flatMap { it.families }.mapNotNull { it.defaults?.categoryId }.forEach { assertTrue(it, it in ids) }
    }

    @Test
    fun tolerantReaderAcceptsOtherShapes() {
        val doc = """{"categories":[{"id":"food","name":"Food","parent":null,"kind":"spend"},{"id":"x","name_en":"X","name_sw":"Y"}],
                      "rules":[{"paybill":"247247","category":"transfers"},{"pattern":"Java House","category_id":"food","display":"Java"}]}"""
        val loaded = Taxonomy.parse(Json.parseToJsonElement(doc))!!
        assertEquals(listOf("food", "x"), loaded.categories.map { it.id })
        assertEquals("Y", loaded.categories[1].nameSw)
        assertEquals("Food", loaded.categories[0].nameSw) // falls back to English
        assertEquals(2, loaded.seeds.size)
        assertEquals("paybill", loaded.seeds[0].matchKind)
        assertEquals("247247", loaded.seeds[0].matchValue)
        assertEquals("java house", loaded.seeds[1].matchValue)
        assertEquals("Java", loaded.seeds[1].displayName)
        assertNull(Taxonomy.parse(Json.parseToJsonElement("\"nope\"")))
    }
}
