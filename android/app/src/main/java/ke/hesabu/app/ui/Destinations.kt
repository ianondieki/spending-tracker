package ke.hesabu.app.ui

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.ui.graphics.vector.ImageVector
import ke.hesabu.app.R

/** Top-level destinations shown in the bottom navigation bar. Routes are stable strings. */
enum class Destination(
    val route: String,
    @StringRes val labelRes: Int,
    val icon: ImageVector,
) {
    Home("home", R.string.nav_home, Icons.Outlined.Home),
    Transactions("transactions", R.string.nav_transactions, Icons.Outlined.ReceiptLong),
    Reports("reports", R.string.nav_reports, Icons.Outlined.Insights),
    Settings("settings", R.string.nav_settings, Icons.Outlined.Settings),
}
