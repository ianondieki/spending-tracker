@file:OptIn(ExperimentalTextApi::class)

package ke.hesabu.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import ke.hesabu.app.R

/*
 * Type from contracts/design-tokens.json: one family (Schibsted Grotesk, bundled, OFL), weights 400/500/700,
 * scale 12/14/16/20/28/40/56, line-height 1.45 for prose and 1.1 for numerals, tabular figures on every number.
 * No letter-spacing, no all-caps.
 */

private fun font(weight: FontWeight, style: FontStyle = FontStyle.Normal) = Font(
    resId = if (style == FontStyle.Italic) R.font.schibsted_grotesk_italic else R.font.schibsted_grotesk,
    weight = weight,
    style = style,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val SchibstedGrotesk: FontFamily = FontFamily(
    font(FontWeight.Normal),
    font(FontWeight.Medium),
    font(FontWeight.Bold),
    font(FontWeight.Normal, FontStyle.Italic),
    font(FontWeight.Medium, FontStyle.Italic),
    font(FontWeight.Bold, FontStyle.Italic),
)

/** OpenType feature string that selects tabular (fixed-width) numerals. */
const val TABULAR_NUMERALS = "tnum"

private const val PROSE = 1.45f
private const val NUMERAL = 1.1f

private val trimmedLineHeight = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None,
)

private fun style(sizePx: Int, weight: FontWeight, lineHeight: Float, numerals: Boolean = false): TextStyle {
    val size = sizePx.sp
    return TextStyle(
        fontFamily = SchibstedGrotesk,
        fontWeight = weight,
        fontSize = size,
        lineHeight = (sizePx * lineHeight).sp,
        letterSpacing = 0.sp,
        fontFeatureSettings = if (numerals) TABULAR_NUMERALS else null,
        platformStyle = PlatformTextStyle(includeFontPadding = false),
        lineHeightStyle = trimmedLineHeight,
    )
}

/** Material typography mapped onto the seven-step scale. */
val HesabuTypography = Typography(
    displayLarge = style(56, FontWeight.Bold, NUMERAL),
    displayMedium = style(40, FontWeight.Bold, NUMERAL),
    displaySmall = style(28, FontWeight.Bold, PROSE),
    headlineLarge = style(28, FontWeight.Bold, PROSE),
    headlineMedium = style(20, FontWeight.Bold, PROSE),
    headlineSmall = style(20, FontWeight.Medium, PROSE),
    titleLarge = style(20, FontWeight.Medium, PROSE),
    titleMedium = style(16, FontWeight.Medium, PROSE),
    titleSmall = style(14, FontWeight.Medium, PROSE),
    bodyLarge = style(16, FontWeight.Normal, PROSE),
    bodyMedium = style(14, FontWeight.Normal, PROSE),
    bodySmall = style(12, FontWeight.Normal, PROSE),
    labelLarge = style(14, FontWeight.Medium, PROSE),
    labelMedium = style(12, FontWeight.Medium, PROSE),
    labelSmall = style(12, FontWeight.Normal, PROSE),
)

/**
 * Numeral styles, line-height 1.1, used by MoneyText and the charts. Tabular figures are not set here: in this font
 * `tnum` on a whole string also widens the thousands comma to a digit slot, so callers wrap amounts in
 * `tabularDigits()` (MoneyText does), which applies `tnum` to digit runs only.
 */
@Immutable
data class MoneyTypography(
    /** 14/500: amounts inside dense rows and chart labels. */
    val small: TextStyle = style(14, FontWeight.Medium, NUMERAL),
    /** 16/500: the amount column of a ledger row. */
    val row: TextStyle = style(16, FontWeight.Medium, NUMERAL),
    /** 20/700: a sheet total or KPI value. */
    val emphasis: TextStyle = style(20, FontWeight.Bold, NUMERAL),
    /** 28/700: an account balance. */
    val large: TextStyle = style(28, FontWeight.Bold, NUMERAL),
    /** 40/700: the total under a tally's double rule. */
    val total: TextStyle = style(40, FontWeight.Bold, NUMERAL),
    /** 56/700: the hero total that opens a report. */
    val hero: TextStyle = style(56, FontWeight.Bold, NUMERAL),
)

val LocalMoneyTypography = staticCompositionLocalOf { MoneyTypography() }

/** Tabular figures for a one-off number inside prose (dates, counts). */
fun TextStyle.tabular(): TextStyle = copy(fontFeatureSettings = TABULAR_NUMERALS)

/** Scales a style's font size and line height together, for dynamic type up to 130 %. */
fun TextStyle.scaled(factor: Float): TextStyle =
    copy(fontSize = fontSize.times(factor), lineHeight = lineHeight.times(factor))

private fun TextUnit.times(factor: Float): TextUnit = if (isSpecified) (value * factor).sp else this
