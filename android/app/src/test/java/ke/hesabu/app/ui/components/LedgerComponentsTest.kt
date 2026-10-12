package ke.hesabu.app.ui.components

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.MoneyTone
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Robolectric: the ledger components render the token format and expose readable semantics. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LedgerComponentsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun moneyTextUsesTheTokenFormatAndReadsAsShillings() {
        compose.setContent { HesabuTheme { MoneyText(cents = 1_245_000, tone = MoneyTone.Out) } }
        compose.onNodeWithText("KSh 12,450").assertIsDisplayed()
        compose.onNodeWithContentDescription("12,450 shillings").assertIsDisplayed()
    }

    @Test
    fun tallyShowsRowsAndTotalWithReducedMotion() {
        compose.setContent {
            HesabuTheme(reducedMotion = true) {
                Tally(
                    rows = listOf(TallyRow("Monday", 120_000), TallyRow("Tuesday", 45_000)),
                    totalLabel = "This week",
                    totalCents = 165_000,
                )
            }
        }
        compose.onNodeWithText("Monday").assertIsDisplayed()
        compose.onNodeWithText("KSh 1,200").assertIsDisplayed()
        compose.onNodeWithText("KSh 1,650").assertIsDisplayed()
        compose.onNodeWithContentDescription("This week KSh 1,650. Monday KSh 1,200. Tuesday KSh 450").assertIsDisplayed()
    }

    @Test
    fun tallyRevealCompletesWithinTheMotionToken() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            HesabuTheme(reducedMotion = false) {
                Tally(rows = listOf(TallyRow("Rent", 1_500_000)), totalLabel = "Total", totalCents = 1_500_000)
            }
        }
        compose.mainClock.advanceTimeBy(400)
        // The row and the total both read KSh 15,000 and both are visible once the 300 ms reveal has run.
        compose.onAllNodesWithText("KSh 15,000").assertCountEquals(2)
        compose.onAllNodesWithText("KSh 15,000")[0].assertIsDisplayed()
        compose.onAllNodesWithText("KSh 15,000")[1].assertIsDisplayed()
    }

    @Test
    fun ledgerRowShowsLabelSecondaryAndAmount() {
        compose.setContent {
            HesabuTheme {
                LedgerRow(label = "Naivas", cents = 345_000, secondary = "Buy goods", tone = MoneyTone.Out, trailing = "Fee KSh 0")
            }
        }
        compose.onNodeWithText("Naivas").assertIsDisplayed()
        compose.onNodeWithText("Buy goods").assertIsDisplayed()
        compose.onNodeWithText("KSh 3,450").assertIsDisplayed()
    }
}
