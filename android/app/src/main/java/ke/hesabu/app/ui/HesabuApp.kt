package ke.hesabu.app.ui

import android.content.Context
import android.content.res.Configuration
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.ui.accounts.AccountsScreen
import ke.hesabu.app.ui.home.HomeScreen
import ke.hesabu.app.ui.onboarding.DisclosureScreen
import ke.hesabu.app.ui.onboarding.OemGuidance
import ke.hesabu.app.ui.onboarding.OemGuidanceScreen
import ke.hesabu.app.ui.onboarding.OnboardingFlow
import ke.hesabu.app.ui.onboarding.PermissionStep
import ke.hesabu.app.ui.reports.ReportScreen
import ke.hesabu.app.ui.reports.ReportsScreen
import ke.hesabu.app.ui.settings.PasteImportScreen
import ke.hesabu.app.ui.settings.SettingsScreen
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.transactions.TeachScreen
import ke.hesabu.app.ui.transactions.TransactionDetailScreen
import ke.hesabu.app.ui.transactions.TransactionsScreen
import java.util.Locale
import kotlinx.coroutines.launch

/** Secondary routes (not in the bottom bar). */
object Routes {
    const val ACCOUNTS = "accounts"
    const val TEACH = "teach"
    const val IMPORT = "import"
    const val OEM = "oem"
    const val DISCLOSURE = "disclosure"
    const val TRANSACTION = "transaction/{id}"
    const val REPORT = "report/{id}"
    fun transaction(id: String) = "transaction/$id"
    fun report(id: String) = "report/$id"
}

/**
 * Root: applies the chosen language and theme, shows onboarding until it is done, then the app shell.
 * The language is applied by wrapping the context so every stringResource call sees the chosen locale.
 */
@Composable
fun HesabuRoot(startRoute: String? = null) {
    val context = LocalContext.current
    val graph = remember { HesabuApplication.graph(context) }
    val settings by graph.settings.settings.collectAsStateWithLifecycle(initialValue = null)
    val s = settings ?: return
    val localized = remember(s.locale) { context.localized(s.locale) }
    val dark = when (s.theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    CompositionLocalProvider(LocalContext provides localized) {
        HesabuTheme(darkTheme = dark) {
            if (!s.onboardingDone) OnboardingFlow(onFinished = {}) else HesabuApp(startRoute = startRoute)
        }
    }
}

fun Context.localized(locale: String): Context {
    val config = Configuration(resources.configuration)
    config.setLocale(Locale(locale))
    return createConfigurationContext(config)
}

/** App shell: bottom navigation plus the NavHost of the four top-level screens and the secondary routes. */
@Composable
fun HesabuApp(navController: NavHostController = rememberNavController(), startRoute: String? = null) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val colors = HesabuTheme.colors

    Scaffold(
        containerColor = colors.paper,
        bottomBar = {
            NavigationBar(containerColor = colors.sheet, tonalElevation = androidx.compose.ui.unit.Dp(0f)) {
                Destination.entries.forEach { destination ->
                    val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(destination.route) {
                                // One copy of each top-level screen on the stack; keep its state when switching tabs.
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon, contentDescription = null) },
                        label = { Text(stringResource(destination.labelRes)) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = colors.onBiro, selectedTextColor = colors.ink, indicatorColor = colors.biro,
                            unselectedIconColor = colors.inkSoft, unselectedTextColor = colors.inkSoft,
                        ),
                    )
                }
            }
        },
    ) { innerPadding ->
        HesabuNavHost(navController = navController, modifier = Modifier.padding(innerPadding), startRoute = startRoute)
    }
}

@Composable
fun HesabuNavHost(navController: NavHostController, modifier: Modifier = Modifier, startRoute: String? = null) {
    NavHost(
        navController = navController,
        startDestination = startRoute?.takeIf { r -> Destination.entries.any { it.route == r } } ?: Destination.Home.route,
        modifier = modifier,
    ) {
        composable(Destination.Home.route) {
            HomeScreen(
                onOpenTransactions = { navController.navigate(Destination.Transactions.route) },
                onOpenTeach = { navController.navigate(Routes.TEACH) },
                onOpenAccounts = { navController.navigate(Routes.ACCOUNTS) },
                onOpenImport = { navController.navigate(Routes.IMPORT) },
                onOpenTransaction = { navController.navigate(Routes.transaction(it)) },
            )
        }
        composable(Destination.Transactions.route) {
            TransactionsScreen(
                onOpenTransaction = { navController.navigate(Routes.transaction(it)) },
                onOpenTeach = { navController.navigate(Routes.TEACH) },
                onOpenImport = { navController.navigate(Routes.IMPORT) },
            )
        }
        composable(Destination.Reports.route) { ReportsScreen(onOpenReport = { navController.navigate(Routes.report(it)) }) }
        composable(Routes.REPORT) { entry -> ReportScreen(reportId = entry.arguments?.getString("id") ?: "", onBack = { navController.popBackStack() }) }
        composable(Destination.Settings.route) {
            SettingsScreen(
                onOpenImport = { navController.navigate(Routes.IMPORT) },
                onOpenOemHelp = { navController.navigate(Routes.OEM) },
                onOpenDisclosure = { navController.navigate(Routes.DISCLOSURE) },
            )
        }
        composable(Routes.ACCOUNTS) { AccountsScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.TEACH) { TeachScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.IMPORT) { PasteImportScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.TRANSACTION) { entry -> TransactionDetailScreen(id = entry.arguments?.getString("id") ?: "", onBack = { navController.popBackStack() }) }
        composable(Routes.OEM) {
            val context = LocalContext.current
            OemGuidanceScreen(
                oem = remember { OemGuidance.detect() },
                onOpenSettings = { runCatching { context.startActivity(OemGuidance.batterySettingsIntent(context)) } },
                onDone = { navController.popBackStack() },
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.DISCLOSURE) {
            val context = LocalContext.current
            val graph = remember { HesabuApplication.graph(context) }
            val request = PermissionStep { sms, _ ->
                graph.scope.launch { graph.settings.set(ke.hesabu.app.data.SettingsKeys.SmsConsentGiven, sms) }
                if (sms) {
                    ke.hesabu.app.ingest.BackfillWorker.start(context, 12)
                    ke.hesabu.app.ingest.BackfillWorker.schedulePeriodicReconcile(context)
                }
                navController.popBackStack()
            }
            DisclosureScreen(
                senders = remember { graph.engine.packs.flatMap { it.senderIds }.distinct().sorted() },
                onAllow = request,
                onNotNow = { navController.popBackStack() },
            )
        }
    }
}
