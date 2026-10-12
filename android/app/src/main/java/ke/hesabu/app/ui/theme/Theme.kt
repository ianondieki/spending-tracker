package ke.hesabu.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

/*
 * Material3 colour schemes with PLACEHOLDER values.
 * contracts/design-tokens.json is authoritative; regenerate these from the tokens, do not hand-tune.
 * Dynamic colour is intentionally off: the brand palette and the semantic money colours must stay
 * stable across devices so reports and the app read as one system.
 */
private val LightColors = lightColorScheme(
    primary = ForestPrimary,
    onPrimary = ForestOnPrimary,
    primaryContainer = ForestPrimaryContainer,
    onPrimaryContainer = ForestOnPrimaryContainer,
    secondary = ClaySecondary,
    onSecondary = ClayOnSecondary,
    secondaryContainer = ClaySecondaryContainer,
    onSecondaryContainer = ClayOnSecondaryContainer,
    background = SurfaceLight,
    onBackground = OnSurfaceLight,
    surface = SurfaceLight,
    onSurface = OnSurfaceLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = OnSurfaceVariantLight,
    outline = OutlineLight,
    error = ErrorLight,
    onError = OnErrorLight,
)

private val DarkColors = darkColorScheme(
    primary = ForestPrimaryDark,
    onPrimary = ForestOnPrimaryDark,
    primaryContainer = ForestPrimaryContainerDark,
    onPrimaryContainer = ForestOnPrimaryContainerDark,
    secondary = ClaySecondaryDark,
    onSecondary = ClayOnSecondaryDark,
    secondaryContainer = ClaySecondaryContainerDark,
    onSecondaryContainer = ClayOnSecondaryContainerDark,
    background = SurfaceDark,
    onBackground = OnSurfaceDark,
    surface = SurfaceDark,
    onSurface = OnSurfaceDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = OnSurfaceVariantDark,
    outline = OutlineDark,
    error = ErrorDark,
    onError = OnErrorDark,
)

@Composable
fun HesabuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = HesabuTypography,
        content = content,
    )
}
