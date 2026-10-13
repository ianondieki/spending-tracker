package ke.hesabu.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import ke.hesabu.app.ui.theme.HesabuTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StartupScreensTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun errorScreenShowsTheDetailAndRetries() {
        var retries = 0
        compose.setContent { HesabuTheme { StartupErrorScreen(detail = "java.lang.IllegalStateException: Secure storage unavailable", onRetry = { retries++ }) } }
        compose.onNodeWithText("Hesabu could not open").assertIsDisplayed()
        compose.onNodeWithText("java.lang.IllegalStateException: Secure storage unavailable").assertIsDisplayed()
        compose.onNodeWithText("Try again").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun openingScreenRenders() {
        compose.setContent { HesabuTheme { StartupOpening() } }
        compose.onNodeWithText("Opening your ledger…").assertIsDisplayed()
    }

    @Test
    fun describeListsTheCauseChain() {
        val t = IllegalStateException("Secure storage unavailable", java.security.KeyStoreException("Keystore operation failed", RuntimeException()))
        val lines = StartupFailure.describe(t).lines()
        assertEquals("java.lang.IllegalStateException: Secure storage unavailable", lines[0])
        assertEquals("java.security.KeyStoreException: Keystore operation failed", lines[1])
        assertEquals("java.lang.RuntimeException", lines[2])
        assertEquals(3, lines.size)
    }
}
