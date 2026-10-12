package ke.hesabu.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.ui.onboarding.OnboardingFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

/** Root: onboarding until it is done, then the app shell. */
@Composable
fun HesabuRoot() {
    val context = LocalContext.current
    val graph = remember { HesabuApplication.graph(context) }
    val settings by graph.settings.settings.collectAsStateWithLifecycle(initialValue = null)
    val s = settings ?: return
    if (!s.onboardingDone) {
        OnboardingFlow(onFinished = {})
    } else {
        HesabuApp()
    }
}

/** App shell: bottom navigation plus the NavHost of the four top-level screens. */
@Composable
fun HesabuApp(navController: NavHostController = rememberNavController()) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
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
                    )
                }
            }
        },
    ) { innerPadding ->
        HesabuNavHost(
            navController = navController,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@Composable
fun HesabuNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    NavHost(
        navController = navController,
        startDestination = Destination.Home.route,
        modifier = modifier,
    ) {
        composable(Destination.Home.route) { HomeScreen() }
        composable(Destination.Transactions.route) { TransactionsScreen() }
        composable(Destination.Reports.route) { ReportsScreen() }
        composable(Destination.Settings.route) { SettingsScreen() }
    }
}
