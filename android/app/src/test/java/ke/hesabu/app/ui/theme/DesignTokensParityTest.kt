package ke.hesabu.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * The Kotlin colour constants must equal contracts/design-tokens.json, byte for byte. The contracts directory is
 * passed by Gradle; when a packaging step runs the tests outside the monorepo the check is skipped, not failed.
 */
class DesignTokensParityTest {

    private val tokens: JsonObject? by lazy {
        val dir = System.getProperty("hesabu.contractsDir") ?: return@lazy null
        val file = File(dir, "design-tokens.json")
        if (!file.isFile) null else Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun hex(color: Color): String = String.format("#%06X", color.toArgb() and 0xFFFFFF)

    private fun check(theme: String, colors: HesabuColors) {
        val t = tokens ?: run { assumeTrue("contracts not available", false); return }
        val c = t["color"]!!.jsonObject[theme]!!.jsonObject
        fun v(k: String) = c[k]!!.jsonPrimitive.content.uppercase()
        assertEquals(v("paper"), hex(colors.paper))
        assertEquals(v("sheet"), hex(colors.sheet))
        assertEquals(v("rule"), hex(colors.rule))
        assertEquals(v("ink"), hex(colors.ink))
        assertEquals(v("ink_soft"), hex(colors.inkSoft))
        assertEquals(v("biro"), hex(colors.biro))
        assertEquals(v("in"), hex(colors.moneyIn))
        assertEquals(v("out"), hex(colors.moneyOut))
        assertEquals(v("fee"), hex(colors.fee))
        assertEquals(v("transfer"), hex(colors.transfer))
        assertEquals(v("warn"), hex(colors.warn))
        assertEquals(v("on_biro"), hex(colors.onBiro))

        val charts = t["charts"]!!.jsonObject
        val ramp = charts["categorical"]!!.jsonObject[theme]!!.jsonArray.map { it.jsonPrimitive.content.uppercase() }
        assertEquals(ramp, colors.categorical.map(::hex))
        assertEquals(charts["other_slice"]!!.jsonObject[theme]!!.jsonPrimitive.content.uppercase(), hex(colors.otherSlice))
        assertEquals(charts["average_line"]!!.jsonObject[theme]!!.jsonPrimitive.content.uppercase(), hex(colors.averageLine))
    }

    @Test
    fun lightColoursMatchTheTokens() = check("light", LightHesabuColors)

    @Test
    fun darkColoursMatchTheTokens() = check("dark", DarkHesabuColors)

    @Test
    fun motionAndScaleMatchTheTokens() {
        val t = tokens ?: run { assumeTrue("contracts not available", false); return }
        val motion = t["motion"]!!.jsonObject
        assertEquals(motion["tally_ms"]!!.jsonPrimitive.content.toInt(), HesabuMotion.TALLY_MS)
        assertEquals(motion["interaction_ms"]!!.jsonPrimitive.content.toInt(), HesabuMotion.INTERACTION_MS)
        val scale = t["font"]!!.jsonObject["scale_px"]!!.jsonObject
        val money = MoneyTypography()
        assertEquals(scale["total"]!!.jsonPrimitive.content.toFloat(), money.hero.fontSize.value)
        assertEquals(scale["display"]!!.jsonPrimitive.content.toFloat(), money.total.fontSize.value)
        assertEquals(scale["md"]!!.jsonPrimitive.content.toFloat(), HesabuTypography.bodyLarge.fontSize.value)
        assertEquals(scale["sm"]!!.jsonPrimitive.content.toFloat(), HesabuTypography.bodyMedium.fontSize.value)
        assertEquals(t["font"]!!.jsonObject["features"]!!.jsonObject["numerals"]!!.jsonPrimitive.content, TABULAR_NUMERALS)
    }
}
