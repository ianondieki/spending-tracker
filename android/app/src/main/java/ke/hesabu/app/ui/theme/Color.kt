package ke.hesabu.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/*
 * Colour tokens. Values are copied verbatim from contracts/design-tokens.json (version 1.0.0);
 * DesignTokensParityTest fails when they drift. Nothing here is hand-tuned.
 */

/** The ten named colours of one theme (light or dark), plus the colour that sits on biro. */
@Immutable
data class HesabuColors(
    val paper: Color,
    val sheet: Color,
    val rule: Color,
    val ink: Color,
    val inkSoft: Color,
    val biro: Color,
    val moneyIn: Color,
    val moneyOut: Color,
    val fee: Color,
    val transfer: Color,
    val warn: Color,
    val onBiro: Color,
    /** Six-step categorical ramp for category series (ink to biro, never a rainbow). */
    val categorical: List<Color>,
    val otherSlice: Color,
    val averageLine: Color,
    val isDark: Boolean,
)

val LightHesabuColors = HesabuColors(
    paper = Color(0xFFF3F5F7),
    sheet = Color(0xFFFFFFFF),
    rule = Color(0xFFC9D2DC),
    ink = Color(0xFF141E2E),
    inkSoft = Color(0xFF5B6878),
    biro = Color(0xFF1F4FD8),
    moneyIn = Color(0xFF1E7F5C),
    moneyOut = Color(0xFF141E2E),
    fee = Color(0xFFB7791F),
    transfer = Color(0xFF6B7A8F),
    warn = Color(0xFFA23B2A),
    onBiro = Color(0xFFFFFFFF),
    categorical = listOf(
        Color(0xFF141E2E), Color(0xFF1F4FD8), Color(0xFF5B6878),
        Color(0xFF7B93E8), Color(0xFF9AA6B5), Color(0xFFC2CCF5),
    ),
    otherSlice = Color(0xFFDCE2E9),
    averageLine = Color(0xFF5B6878),
    isDark = false,
)

val DarkHesabuColors = HesabuColors(
    paper = Color(0xFF101722),
    sheet = Color(0xFF17202D),
    rule = Color(0xFF2A3443),
    ink = Color(0xFFE8ECF1),
    inkSoft = Color(0xFF9AA6B5),
    biro = Color(0xFF6D8DFF),
    moneyIn = Color(0xFF4FC08D),
    moneyOut = Color(0xFFE8ECF1),
    fee = Color(0xFFE0A43C),
    transfer = Color(0xFF8A98AC),
    warn = Color(0xFFE0705C),
    onBiro = Color(0xFF0B1220),
    categorical = listOf(
        Color(0xFFE8ECF1), Color(0xFF6D8DFF), Color(0xFF9AA6B5),
        Color(0xFFA9BBFF), Color(0xFF6F7C8E), Color(0xFF4A5CA8),
    ),
    otherSlice = Color(0xFF2F3A4A),
    averageLine = Color(0xFF9AA6B5),
    isDark = true,
)

val LocalHesabuColors = staticCompositionLocalOf { LightHesabuColors }

/** The meaning of an amount, which decides its colour. Spending is written in ink, never in red. */
enum class MoneyTone { In, Out, Fee, Transfer, Neutral }

fun HesabuColors.forTone(tone: MoneyTone): Color = when (tone) {
    MoneyTone.In -> moneyIn
    MoneyTone.Out -> moneyOut
    MoneyTone.Fee -> fee
    MoneyTone.Transfer -> transfer
    MoneyTone.Neutral -> ink
}
