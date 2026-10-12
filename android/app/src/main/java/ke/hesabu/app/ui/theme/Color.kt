package ke.hesabu.app.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * PLACEHOLDER palette.
 *
 * contracts/design-tokens.json (frozen by the orchestrator) is the authoritative source for every
 * colour, type scale and semantic money colour. These values exist only so the scaffold compiles and
 * renders something quiet and readable; Lane A replaces them with values generated from the tokens.
 */

// Light
val ForestPrimary = Color(0xFF1F4D3A)
val ForestOnPrimary = Color(0xFFF3E7D3)
val ForestPrimaryContainer = Color(0xFFCDE8D8)
val ForestOnPrimaryContainer = Color(0xFF0B2A1E)
val ClaySecondary = Color(0xFF7A4B2A)
val ClayOnSecondary = Color(0xFFFFF4EA)
val ClaySecondaryContainer = Color(0xFFF2DCC9)
val ClayOnSecondaryContainer = Color(0xFF3A2010)
val SurfaceLight = Color(0xFFFBF7F2)
val OnSurfaceLight = Color(0xFF1C1B18)
val SurfaceVariantLight = Color(0xFFEFE8DF)
val OnSurfaceVariantLight = Color(0xFF4E4A43)
val OutlineLight = Color(0xFF807A71)
val ErrorLight = Color(0xFFB3261E)
val OnErrorLight = Color(0xFFFFFFFF)

// Dark
val ForestPrimaryDark = Color(0xFF9FD3B8)
val ForestOnPrimaryDark = Color(0xFF07301F)
val ForestPrimaryContainerDark = Color(0xFF17402F)
val ForestOnPrimaryContainerDark = Color(0xFFCDE8D8)
val ClaySecondaryDark = Color(0xFFE2B48F)
val ClayOnSecondaryDark = Color(0xFF3A2010)
val ClaySecondaryContainerDark = Color(0xFF5B3A22)
val ClayOnSecondaryContainerDark = Color(0xFFF2DCC9)
val SurfaceDark = Color(0xFF121311)
val OnSurfaceDark = Color(0xFFE7E2DA)
val SurfaceVariantDark = Color(0xFF2A2B27)
val OnSurfaceVariantDark = Color(0xFFCAC4B9)
val OutlineDark = Color(0xFF938D83)
val ErrorDark = Color(0xFFF2B8B5)
val OnErrorDark = Color(0xFF601410)

/** Semantic money colours (placeholders; tokens win). Money in, money out, fees, transfers. */
object MoneyColors {
    val In = Color(0xFF2E7D4F)
    val Out = Color(0xFF1C1B18)
    val Fee = Color(0xFFB35C1E)
    val Transfer = Color(0xFF5B6B7A)
}
