package ke.hesabu.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.RoborazziOptions
import com.github.takahirom.roborazzi.captureRoboImage
import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.data.UnknownMessageEntity
import ke.hesabu.app.ingest.IngestPipeline
import ke.hesabu.app.ui.accounts.AccountsContent
import ke.hesabu.app.ui.accounts.AccountsViewModel
import ke.hesabu.app.ui.home.HomeContent
import ke.hesabu.app.ui.home.HomeViewModel
import ke.hesabu.app.ui.onboarding.BackfillScreen
import ke.hesabu.app.ui.onboarding.BackfillUiState
import ke.hesabu.app.ui.onboarding.DisclosureScreen
import ke.hesabu.app.ui.onboarding.OemGuidance
import ke.hesabu.app.ui.onboarding.OemGuidanceScreen
import ke.hesabu.app.ui.onboarding.WelcomeScreen
import ke.hesabu.app.ui.reports.ReportScreenContent
import ke.hesabu.app.ui.reports.ReportViewModel
import ke.hesabu.app.ui.reports.ReportsScreenContent
import ke.hesabu.app.ui.reports.ReportsViewModel
import ke.hesabu.app.ui.reports.SampleReport
import ke.hesabu.app.ui.settings.PasteImportContent
import ke.hesabu.app.ui.settings.SettingsContent
import ke.hesabu.app.ui.settings.SettingsViewModel
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.transactions.TeachContent
import ke.hesabu.app.ui.transactions.TeachViewModel
import ke.hesabu.app.ui.transactions.TransactionDetailContent
import ke.hesabu.app.ui.transactions.TransactionsContent
import ke.hesabu.app.ui.transactions.TransactionsViewModel
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate

/**
 * Design review screenshots: every screen in its main state, at 360×800 and 412×915, light and dark. Written to
 * android/screenshots/ (see its README). States are plain objects so the pictures are deterministic.
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScreenshotTest(private val width: Int, private val height: Int, private val dark: Boolean) {

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}x{1} dark={2}")
        fun sizes(): List<Array<Any>> = listOf(
            arrayOf(360, 800, false), arrayOf(360, 800, true), arrayOf(412, 915, false), arrayOf(412, 915, true),
        )
        private val now = 1_792_000_000_000L
    }

    @get:Rule
    val compose = createComposeRule()

    private val dir: File = File(System.getProperty("hesabu.screenshotsDir") ?: "screenshots")

    private fun shoot(name: String, content: @Composable () -> Unit) {
        // Qualifier order matters: size, then UI mode (night), then density.
        RuntimeEnvironment.setQualifiers("w${width}dp-h${height}dp-" + (if (dark) "night" else "notnight") + "-xhdpi")
        compose.setContent { HesabuTheme(darkTheme = dark, reducedMotion = true) { content() } }
        compose.waitForIdle()
        dir.mkdirs()
        val file = File(dir, "$name-${width}x$height-${if (dark) "dark" else "light"}.png")
        compose.onRoot().captureRoboImage(file.absolutePath, roborazziOptions = RoborazziOptions())
    }

    @Test
    fun home() = shoot("home") {
        HomeContent(
            HomeViewModel.State(
                loading = false, ledgerEmpty = false,
                days = listOf(
                    HomeViewModel.DayRow(LocalDate.of(2026, 10, 12), 342_000, 4),
                    HomeViewModel.DayRow(LocalDate.of(2026, 10, 13), 125_000, 2),
                    HomeViewModel.DayRow(LocalDate.of(2026, 10, 14), 48_000, 1),
                ),
                weekOutCents = 515_000, weekInCents = 4_500_000, weekFeeCents = 3_600, lastWeekOutCents = 612_000,
                accounts = listOf(SampleData.account), unknownCount = 2, recent = listOf(SampleData.tx), weekStart = LocalDate.of(2026, 10, 12),
                nextReportAt = java.time.ZonedDateTime.of(2026, 10, 18, 19, 30, 0, 0, java.time.ZoneId.of("Africa/Nairobi")),
            ),
            nowMillis = now,
        )
    }

    @Test
    fun homeEmpty() = shoot("home-empty") { HomeContent(HomeViewModel.State(loading = false, ledgerEmpty = true), nowMillis = now) }

    @Test
    fun transactions() = shoot("transactions") {
        val second = SampleData.tx.copy(id = "t2", counterpartyName = "JANE WANJIKU", type = "SEND_MONEY", amountCents = 120_000, feeCents = 2_300, occurredAtMillis = now - 3_600_000)
        val third = SampleData.tx.copy(id = "t3", counterpartyName = "JOHN KAMAU", type = "RECEIVE_MONEY", direction = "in", amountCents = 250_000, occurredAtMillis = now - 90_000_000)
        TransactionsContent(
            TransactionsViewModel.State(
                loading = false, ledgerEmpty = false, count = 3, totalOutCents = 165_000, totalInCents = 250_000,
                groups = listOf(
                    TransactionsViewModel.DayGroup(LocalDate.of(2026, 10, 14), listOf(SampleData.tx.copy(occurredAtMillis = now - 600_000), second), 165_000, 165_000),
                    TransactionsViewModel.DayGroup(LocalDate.of(2026, 10, 13), listOf(third), 0, 0),
                ),
                categories = listOf(SampleData.category),
            ),
            nowMillis = now,
        )
    }

    @Test
    fun transactionDetail() = shoot("transaction-detail") {
        TransactionDetailContent(SampleData.tx, listOf(SampleData.category, SampleData.category.copy(id = "eating_out", nameEn = "Eating out")), Periods(), {}, { _, _ -> }, {}, {})
    }

    @Test
    fun teach() = shoot("teach") {
        val row = UnknownMessageEntity("u1", "MPESA", ByteArray(0), now - 7_200_000, "h1", packIds = "mpesa_builtin", source = "sms", updatedAtMillis = now)
        TeachContent(
            TeachViewModel.State(loading = false, items = listOf(TeachViewModel.Item(row, "QJK3X8Y2N9 Confirmed. Ksh350.00 has been paid for your Lipa Mdogo Mdogo device on 12/10/26.", 35_000)), categories = listOf(SampleData.category)),
            {}, { _, _, _, _ -> }, {},
        )
    }

    @Test
    fun accounts() = shoot("accounts") {
        AccountsContent(AccountsViewModel.State(loading = false, rows = listOf(AccountsViewModel.Row(SampleData.account, 1_215_000, 4_500_000, 3_600, 27))))
    }

    @Test
    fun settings() = shoot("settings") {
        SettingsContent(SettingsViewModel.State(settings = AppSettings(serverUrl = "http://10.0.2.2:8787", smsConsentGiven = true, email = "you@example.com"), packs = listOf(SettingsViewModel.Pack("mpesa_builtin", "0.2.0", "mpesa", 22, "MPESA")), queued = 3))
    }

    @Test
    fun pasteImport() = shoot("import") { PasteImportContent(false, null, 0, ke.hesabu.app.ingest.TextImport.Preview(linkedMapOf("buy_goods" to 2, "send_money" to 1), 1, 1, 5), {}, {}, {}) }

    @Test
    fun reports() = shoot("reports") {
        ReportsScreenContent(
            state = ReportsViewModel.UiState.Ready(weekly = listOf(SampleReport.detail.summary), monthly = emptyList(), source = ke.hesabu.app.ui.reports.ReportsRepository.Source.Server, serverConfigured = false, demoMode = false),
            generate = ReportsViewModel.GenerateState.Idle,
            onOpenReport = {}, onRetry = {}, onGenerate = {},
        )
    }

    @Test
    fun report() = shoot("report") {
        ReportScreenContent(state = ReportViewModel.UiState.Ready(SampleReport.detail), share = ReportViewModel.ShareState.Idle, onBack = {}, onRetry = {}, onShare = {})
    }

    @Test
    fun welcome() = shoot("onboarding-welcome") { WelcomeScreen({}, {}) }

    @Test
    fun disclosure() = shoot("onboarding-disclosure") { DisclosureScreen(listOf("MPESA", "AirtelMoney", "T-Kash"), {}, {}) }

    @Test
    fun backfill() = shoot("onboarding-backfill") {
        BackfillScreen(BackfillUiState(total = 1240, done = 870, parsed = 611, unknown = 9, perSender = mapOf("mpesa" to 588, "airtelmoney" to 23)), months = 12, {}, {})
    }

    @Test
    fun oem() = shoot("onboarding-oem") { OemGuidanceScreen(OemGuidance.Oem.Transsion, {}, {}) }
}
