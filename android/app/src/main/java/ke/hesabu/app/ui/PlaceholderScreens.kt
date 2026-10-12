package ke.hesabu.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.ui.theme.HesabuTheme

/*
 * Placeholder screens so navigation is real from day one. Each becomes its own file with a
 * ViewModel as Lane A builds the feature (master prompt §12).
 */

@Composable
fun HomeScreen() = PlaceholderScreen(
    title = stringResource(R.string.nav_home),
    body = stringResource(R.string.placeholder_home),
)

@Composable
fun TransactionsScreen() = PlaceholderScreen(
    title = stringResource(R.string.nav_transactions),
    body = stringResource(R.string.placeholder_transactions),
)

@Composable
fun ReportsScreen() = PlaceholderScreen(
    title = stringResource(R.string.nav_reports),
    body = stringResource(R.string.placeholder_reports),
)

@Composable
fun SettingsScreen() = PlaceholderScreen(
    title = stringResource(R.string.nav_settings),
    body = stringResource(R.string.placeholder_settings),
)

@Composable
private fun PlaceholderScreen(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(text = title, style = MaterialTheme.typography.headlineSmall)
        Text(
            text = body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = stringResource(R.string.placeholder_coming_soon),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.outline,
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun HomeScreenPreview() {
    HesabuTheme { HomeScreen() }
}
