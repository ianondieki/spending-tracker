package ke.hesabu.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.ui.components.ErrorState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.LoadingState
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.theme.HesabuTheme

/** What [ke.hesabu.app.AppGraph.warmUp] reported; the root shows a screen for each. */
sealed interface StartupState {
    data object Opening : StartupState
    data object Ready : StartupState
    data class Failed(val detail: String) : StartupState
}

/** Reduces a start-up exception to the lines a person can send along: the class and message of each cause. */
object StartupFailure {
    fun describe(t: Throwable): String {
        val lines = ArrayList<String>()
        var cur: Throwable? = t
        var depth = 0
        while (cur != null && depth < 6) {
            val msg = cur.message?.trim().orEmpty()
            lines += if (msg.isEmpty()) cur.javaClass.name else "${cur.javaClass.name}: $msg"
            cur = cur.cause?.takeIf { it !== cur }
            depth++
        }
        return lines.joinToString("\n")
    }
}

/** Paper and a quiet line while the ledger opens; usually gone before it is read. */
@Composable
fun StartupOpening() {
    Box(Modifier.fillMaxSize().background(HesabuTheme.colors.paper), contentAlignment = Alignment.Center) {
        LoadingState(stringResource(R.string.startup_opening))
    }
}

/** The ledger could not be opened: what happened, a retry, and the detail to pass on. Never a dead process. */
@Composable
fun StartupErrorScreen(detail: String, onRetry: () -> Unit) {
    HesabuScreen(title = stringResource(R.string.startup_error_title)) {
        ErrorState(
            title = stringResource(R.string.startup_error_subtitle),
            body = stringResource(R.string.startup_error_body),
            retryLabel = stringResource(R.string.action_retry),
            onRetry = onRetry,
        )
        Sheet(title = stringResource(R.string.startup_error_details)) {
            SelectionContainer {
                Text(
                    detail,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = HesabuTheme.colors.inkSoft,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
