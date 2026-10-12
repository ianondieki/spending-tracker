package ke.hesabu.app.ui.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import ke.hesabu.app.reports.ReportArtefacts
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.ui.theme.HesabuTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Robolectric: the sample ReportDocument renders natively. The hero total, the hero tally's reading, every drawn
 * chart's description, the table toggle, the share options and the empty and list states are all checked.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReportScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val detail = SampleReport.detail

    private fun showReport(d: ReportDetail = detail, onShare: (ShareKind) -> Unit = {}) {
        compose.setContent {
            HesabuTheme(darkTheme = false, reducedMotion = true) {
                ReportScreenContent(
                    state = ReportViewModel.UiState.Ready(d),
                    share = ReportViewModel.ShareState.Idle,
                    onBack = {},
                    onRetry = {},
                    onShare = onShare,
                )
            }
        }
    }

    @Test
    fun rendersTheHeroTotalAndTheChartDescriptions() {
        showReport()
        compose.onNodeWithText("Your week, 5 to 11 October").assertIsDisplayed()
        compose.onNodeWithText("5 to 11 October 2026").assertIsDisplayed()
        // The hero total under the double rule, and the tally read as one sentence.
        compose.onAllNodesWithText("KSh 14,450").onFirst().assertIsDisplayed()
        compose.onNodeWithContentDescription("This week KSh 14,450. Monday KSh 1,240.", substring = true).assertExists()
        // Each drawn chart is one node described by its alt text plus key numbers.
        compose.onNodeWithContentDescription("Donut chart of spending by category", substring = true).assertExists()
        compose.onNodeWithContentDescription("Total KSh 14,450. Groceries KSh 4,630, 32%.", substring = true).assertExists()
        compose.onNodeWithContentDescription("Bar chart of spending per day", substring = true).assertExists()
        compose.onNodeWithContentDescription("Highest Saturday, KSh 4,965. Daily average KSh 2,064.", substring = true).assertExists()
        compose.onNodeWithContentDescription("Bar chart of the eight places you paid most", substring = true).assertExists()
        compose.onNodeWithContentDescription("Fees KSh 187, 1% of spending.", substring = true).assertExists()
        compose.onNodeWithContentDescription("Ends at KSh 3,215.", substring = true).assertExists()
    }

    @Test
    fun rendersProseTableAndFooterSections() {
        showReport()
        compose.onNodeWithText("What stood out").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Eating out more than doubled").assertExists()
        compose.onNodeWithText("Where the money went").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Airtime and data").assertExists()
        compose.onNodeWithText("Coming up").assertExists()
        compose.onNodeWithText("New places this week").assertExists()
        compose.onNodeWithText("Accounts counted: M-Pesa 0712***678, Equity Bank ***1234").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Messages Hesabu could not read: 3").assertExists()
    }

    @Test
    fun showAsTableSwapsTheDonutForLedgerRows() {
        showReport()
        compose.onAllNodesWithText("Show as table").onFirst().performScrollTo().performClick()
        compose.onNodeWithText("Show as chart").assertExists()
        // Groceries now appears as a ledger row with its amount; the donut's description is gone.
        compose.onAllNodesWithText("KSh 4,630").onFirst().assertExists()
        compose.onNodeWithContentDescription("Donut chart of spending by category", substring = true).assertDoesNotExist()
    }

    @Test
    fun shareOptionsWithoutArtefactsAreDisabledWithAReason() {
        showReport()
        compose.onNodeWithContentDescription("Share this report").performClick()
        compose.onNodeWithText("The image is not ready yet").assertIsDisplayed()
        compose.onNodeWithText("The PDF is not ready yet").assertIsDisplayed()
        compose.onNode(hasText("Share image") and hasClickAction()).assertIsNotEnabled()
    }

    @Test
    fun shareImageIsOfferedWhenTheServerMadeOne() {
        var shared: ShareKind? = null
        val withHero = detail.copy(summary = detail.summary.copy(artefacts = ReportArtefacts(heroPngUrl = "https://cdn.example/hero.png")))
        showReport(withHero) { shared = it }
        compose.onNodeWithContentDescription("Share this report").performClick()
        compose.onNodeWithText("Share image").performClick()
        assertTrue(shared == ShareKind.Image)
    }

    @Test
    fun chartsWithoutFactsShowAQuietEmptyState() {
        showReport(detail.copy(facts = null))
        compose.onAllNodesWithText("There is nothing to draw for this period.").onFirst().assertExists()
        compose.onNodeWithContentDescription("This week KSh 14,450", substring = true).assertExists()
    }

    @Test
    fun reportsListShowsTheSampleAndTheServerNote() {
        compose.setContent {
            HesabuTheme(reducedMotion = true) {
                ReportsScreenContent(
                    state = ReportsViewModel.UiState.Ready(
                        weekly = listOf(detail.summary),
                        monthly = emptyList(),
                        source = ReportsRepository.Source.Sample,
                        serverConfigured = false,
                        demoMode = false,
                    ),
                    generate = ReportsViewModel.GenerateState.Idle,
                    onOpenReport = {},
                    onRetry = {},
                    onGenerate = {},
                )
            }
        }
        compose.onNodeWithText("Add your server address in Settings to fetch reports").assertIsDisplayed()
        compose.onNodeWithText("Weekly").assertIsDisplayed()
        compose.onNodeWithText("5 to 11 October 2026").assertIsDisplayed()
        compose.onNodeWithText("Ready").assertIsDisplayed()
        compose.onNodeWithText("12 Oct").assertIsDisplayed()
        compose.onNodeWithText("Generate this week's report").assertIsDisplayed()
    }

    @Test
    fun reportsListErrorOffersRetry() {
        var retried = false
        compose.setContent {
            HesabuTheme(reducedMotion = true) {
                ReportsScreenContent(
                    state = ReportsViewModel.UiState.Failed(LoadError.Network),
                    generate = ReportsViewModel.GenerateState.Idle,
                    onOpenReport = {},
                    onRetry = { retried = true },
                    onGenerate = {},
                )
            }
        }
        compose.onNodeWithText("Reports could not be loaded").assertIsDisplayed()
        compose.onNodeWithText("Try again").performClick()
        assertTrue(retried)
    }
}
