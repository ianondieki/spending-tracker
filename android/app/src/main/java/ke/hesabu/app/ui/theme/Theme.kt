package ke.hesabu.app.ui.theme

import android.provider.Settings
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.dp

/*
 * Material 3 colour schemes derived from the design tokens. Dynamic colour is off on purpose: the palette and the
 * semantic money colours must stay identical across devices so the app and the reports read as one system.
 *
 * Mapping (design brief, "Layout and surfaces"): paper is the page, sheet is the raised ledger sheet (separated by
 * colour alone, never a shadow), rule is every outline and divider, ink is text, biro is the one interactive accent.
 * Container tints are biro composited over sheet at a fixed alpha, so they too follow the tokens.
 */

private fun HesabuColors.toColorScheme(): ColorScheme {
    val biroTint = biro.copy(alpha = if (isDark) 0.22f else 0.12f).compositeOver(sheet)
    val warnTint = warn.copy(alpha = if (isDark) 0.22f else 0.12f).compositeOver(sheet)
    val feeTint = fee.copy(alpha = if (isDark) 0.22f else 0.12f).compositeOver(sheet)
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = biro,
        onPrimary = onBiro,
        primaryContainer = biroTint,
        onPrimaryContainer = ink,
        inversePrimary = biro,
        secondary = inkSoft,
        onSecondary = sheet,
        secondaryContainer = biroTint,
        onSecondaryContainer = ink,
        tertiary = fee,
        onTertiary = sheet,
        tertiaryContainer = feeTint,
        onTertiaryContainer = ink,
        background = paper,
        onBackground = ink,
        surface = paper,
        onSurface = ink,
        surfaceVariant = sheet,
        onSurfaceVariant = inkSoft,
        surfaceTint = Color.Transparent,
        inverseSurface = ink,
        inverseOnSurface = paper,
        error = warn,
        onError = sheet,
        errorContainer = warnTint,
        onErrorContainer = ink,
        outline = rule,
        outlineVariant = rule,
        scrim = Color(0xFF000000),
        surfaceBright = sheet,
        surfaceDim = paper,
        surfaceContainer = sheet,
        surfaceContainerLowest = sheet,
        surfaceContainerLow = sheet,
        surfaceContainerHigh = sheet,
        surfaceContainerHighest = sheet,
    )
}

/** Radius 4 on controls, 8 on sheets, nothing larger. */
val HesabuShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(4.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(8.dp),
    extraLarge = RoundedCornerShape(8.dp),
)

/** Motion tokens in milliseconds. */
object HesabuMotion {
    const val TALLY_MS = 300
    const val INTERACTION_MS = 180
}

/** True when the user has turned animations off; every Hesabu animation then completes instantly. */
val LocalReducedMotion = staticCompositionLocalOf { false }

@Composable
private fun rememberSystemReducedMotion(): Boolean {
    if (LocalInspectionMode.current) return false
    val context = LocalContext.current
    return remember(context) {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f ||
                Settings.Global.getFloat(context.contentResolver, Settings.Global.TRANSITION_ANIMATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
}

@Composable
fun HesabuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    reducedMotion: Boolean = rememberSystemReducedMotion(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkHesabuColors else LightHesabuColors
    val scheme = remember(colors) { colors.toColorScheme() }
    CompositionLocalProvider(
        LocalHesabuColors provides colors,
        LocalMoneyTypography provides MoneyTypography(),
        LocalReducedMotion provides reducedMotion,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = HesabuTypography,
            shapes = HesabuShapes,
            content = content,
        )
    }
}

/** Convenience accessors mirroring MaterialTheme.colorScheme and typography. */
object HesabuTheme {
    val colors: HesabuColors
        @Composable @ReadOnlyComposable get() = LocalHesabuColors.current
    val money: MoneyTypography
        @Composable @ReadOnlyComposable get() = LocalMoneyTypography.current
    val reducedMotion: Boolean
        @Composable @ReadOnlyComposable get() = LocalReducedMotion.current
}
