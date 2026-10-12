package ke.hesabu.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import ke.hesabu.app.ui.theme.HesabuTheme

/** The ruled line: a 1 dp hairline in the `rule` token. It means "money is being counted here". */
@Composable
fun Rule(modifier: Modifier = Modifier, color: Color = HesabuTheme.colors.rule) {
    Canvas(modifier.fillMaxWidth().height(1.dp)) {
        drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 1.dp.toPx())
    }
}

/**
 * The bookkeeper's double rule under a total: two 1 dp lines in ink, 2 dp apart. [progress] in 0..1 draws it
 * from left to right (the tally's single reveal); 1 draws it whole.
 */
@Composable
fun DoubleRule(
    modifier: Modifier = Modifier,
    progress: Float = 1f,
    color: Color = HesabuTheme.colors.ink,
) {
    Canvas(modifier.fillMaxWidth().height(5.dp)) {
        val w = size.width * progress.coerceIn(0f, 1f)
        val stroke = 1.dp.toPx()
        drawLine(color, Offset(0f, stroke / 2), Offset(w, stroke / 2), strokeWidth = stroke)
        drawLine(color, Offset(0f, size.height - stroke / 2), Offset(w, size.height - stroke / 2), strokeWidth = stroke)
    }
}
