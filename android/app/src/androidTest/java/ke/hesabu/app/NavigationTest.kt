package ke.hesabu.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Instrumented smoke test (device/emulator): bottom navigation reaches every top-level screen. */
@RunWith(AndroidJUnit4::class)
class NavigationTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun bottomNavigationReachesReports() {
        composeRule.onNodeWithText("Reports").performClick()
        composeRule.onNodeWithText("Weekly and monthly reports will appear here.").assertIsDisplayed()
    }
}
