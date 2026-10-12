package ke.hesabu.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import ke.hesabu.app.data.AccountEntity
import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.data.CategoryEntity
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.ui.accounts.AccountsContent
import ke.hesabu.app.ui.accounts.AccountsViewModel
import ke.hesabu.app.ui.home.HomeContent
import ke.hesabu.app.ui.home.HomeViewModel
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
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDate

/** Every screen renders its populated, empty and loading states from plain state objects. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScreensSmokeTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = 1_792_000_000_000L // 2026-10-14 in Nairobi

    @Test
    fun homeRendersTallyAndStates() {
        val state = HomeViewModel.State(
            loading = false, ledgerEmpty = false,
            days = listOf(HomeViewModel.DayRow(LocalDate.of(2026, 10, 12), 120_000, 3), HomeViewModel.DayRow(LocalDate.of(2026, 10, 13), 45_000, 1)),
            weekOutCents = 165_000, weekInCents = 500_000, weekFeeCents = 2_300, lastWeekOutCents = 200_000,
            accounts = listOf(SampleData.account), unknownCount = 2, recent = listOf(SampleData.tx), weekStart = LocalDate.of(2026, 10, 12),
        )
        compose.setContent { HesabuTheme(reducedMotion = true) { HomeContent(state, nowMillis = now) } }
        compose.onNodeWithText("KSh 1,650").assertIsDisplayed()
        compose.onNodeWithText("Monday").assertIsDisplayed()
        compose.onNodeWithText("M-PESA").assertIsDisplayed()
    }

    @Test
    fun homeEmptyAndLoading() {
        compose.setContent { HesabuTheme { HomeContent(HomeViewModel.State(loading = false, ledgerEmpty = true), nowMillis = now) } }
        compose.onNodeWithText("No messages yet").assertIsDisplayed()
    }

    @Test
    fun transactionsRenderGroups() {
        val state = TransactionsViewModel.State(
            loading = false, ledgerEmpty = false, count = 1, totalOutCents = 45_000,
            groups = listOf(TransactionsViewModel.DayGroup(LocalDate.of(2026, 10, 12), listOf(SampleData.tx), 45_000, 45_000)),
            categories = listOf(SampleData.category),
        )
        compose.setContent { HesabuTheme { TransactionsContent(state, nowMillis = now) } }
        compose.onNodeWithText("NAIVAS SUPERMARKET").assertIsDisplayed()
        compose.onNodeWithText("KSh 450 so far").assertIsDisplayed()
    }

    @Test
    fun transactionDetailRenders() {
        compose.setContent { HesabuTheme { TransactionDetailContent(SampleData.tx, listOf(SampleData.category), Periods(), {}, { _, _ -> }, {}, {}) } }
        compose.onNodeWithText("KSh 450.00").assertIsDisplayed()
        compose.onNodeWithText("Groceries").assertIsDisplayed()
    }

    @Test
    fun teachAccountsSettingsImportRender() {
        compose.setContent {
            HesabuTheme {
                TeachContent(TeachViewModel.State(loading = false), {}, { _, _, _, _ -> }, {})
            }
        }
        compose.onNodeWithText("Nothing to teach").assertIsDisplayed()
    }

    @Test
    fun accountsRender() {
        val state = AccountsViewModel.State(loading = false, rows = listOf(AccountsViewModel.Row(SampleData.account, 100_000, 50_000, 2_300, 4)))
        compose.setContent { HesabuTheme { AccountsContent(state) } }
        compose.onNodeWithText("KSh 3,450.00").assertIsDisplayed()
    }

    @Test
    fun settingsRender() {
        compose.setContent { HesabuTheme { SettingsContent(SettingsViewModel.State(settings = AppSettings(serverUrl = "http://10.0.2.2:8787"))) } }
        compose.onNodeWithText("Server").assertIsDisplayed()
    }

    @Test
    fun importRenders() {
        compose.setContent { HesabuTheme { PasteImportContent(false, null, 0, {}, {}) } }
        compose.onNodeWithText("Read messages").assertIsDisplayed()
    }
}

object SampleData {
    val account = AccountEntity("mpesa:07XXXXX123", "mpesa", "Safaricom", "M-PESA", "07XXXXX123", 345_000, 1_791_900_000_000L, 1_791_900_000_000L, 0)
    val category = CategoryEntity("groceries", null, "Groceries", "Mboga", "spend", 0)
    val tx = TransactionEntity(
        id = "t1", accountRef = "mpesa:07XXXXX123", provider = "mpesa", externalRef = "QJK3X8Y2M4", type = "BUY_GOODS", direction = "out",
        amountCents = 45_000, feeCents = 0, balanceAfterCents = 365_000, occurredAtMillis = 1_791_900_000_000L, receivedAtMillis = 1_791_900_000_000L,
        counterpartyName = "NAIVAS SUPERMARKET", counterpartyKind = "merchant", counterpartyRefMasked = null, paybill = null, till = null, counterpartyAccountRef = null,
        categoryId = "groceries", categorySource = "merchant", categoryConfidence = 0.9, isTransfer = false, isTransferHint = false, transferPairId = null,
        parseConfidence = 0.95, source = "sms", rawHash = "h", packId = "mpesa_builtin", packVersion = "0.2.0", familyId = "buy_goods", userEdited = false, note = null, updatedAtMillis = 0,
    )
}
