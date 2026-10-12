package ke.hesabu.app.ui.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ke.hesabu.app.R
import ke.hesabu.app.reports.ReportSummary
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.ErrorState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.LoadingState
import ke.hesabu.app.ui.components.SecondaryButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.components.SkeletonRows
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.tabular
import java.util.Locale

/**
 * The Reports list: weekly and monthly reports as ledger rows (the period on the left, status and delivery state
 * underneath, the day it was made on the right; no money, the money is inside). Designed loading, empty and error
 * states, a "Generate this week's report" action, and a note when no server is set up and the sample is shown.
 */
@Composable
fun ReportsScreen(onOpenReport: (String) -> Unit) {
    val context = LocalContext.current
    val repository = remember { ReportsRepository.get(context) }
    val vm: ReportsViewModel = viewModel(factory = ReportsViewModel.factory(repository))
    val state by vm.state.collectAsStateWithLifecycle()
    val generate by vm.generateState.collectAsStateWithLifecycle()
    ReportsScreenContent(
        state = state,
        generate = generate,
        onOpenReport = onOpenReport,
        onRetry = { vm.load(refresh = true) },
        onGenerate = vm::generateThisWeek,
    )
}

/** Stateless body of [ReportsScreen], for tests and previews. */
@Composable
fun ReportsScreenContent(
    state: ReportsViewModel.UiState,
    generate: ReportsViewModel.GenerateState,
    onOpenReport: (String) -> Unit,
    onRetry: () -> Unit,
    onGenerate: () -> Unit,
) {
    HesabuScreen(title = stringResource(R.string.reports_title)) {
        when (state) {
            ReportsViewModel.UiState.Loading -> {
                val loading = stringResource(R.string.reports_loading)
                Sheet(Modifier.semantics { contentDescription = loading }) { SkeletonRows(count = 4) }
            }
            is ReportsViewModel.UiState.Failed -> ErrorState(
                title = stringResource(R.string.reports_error_title),
                body = stringResource(state.error.bodyRes),
                retryLabel = stringResource(R.string.action_retry),
                onRetry = onRetry,
            )
            is ReportsViewModel.UiState.Ready -> {
                SourceNote(state)
                if (state.isEmpty) {
                    EmptyState(
                        title = stringResource(R.string.reports_empty_title),
                        body = stringResource(R.string.reports_empty_body),
                        actionLabel = stringResource(R.string.reports_generate),
                        onAction = onGenerate,
                    )
                } else {
                    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
                    if (state.weekly.isNotEmpty()) ReportGroup(stringResource(R.string.reports_group_weekly), state.weekly, locale, onOpenReport)
                    if (state.monthly.isNotEmpty()) ReportGroup(stringResource(R.string.reports_group_monthly), state.monthly, locale, onOpenReport)
                    SecondaryButton(
                        text = stringResource(R.string.reports_generate),
                        onClick = onGenerate,
                        enabled = generate != ReportsViewModel.GenerateState.Working,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                GenerateNote(generate)
            }
        }
    }
}

/** Says where the list came from when it is not the person's own server. */
@Composable
private fun SourceNote(state: ReportsViewModel.UiState.Ready) {
    if (state.source != ReportsRepository.Source.Sample) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (state.demoMode) {
            Text(stringResource(R.string.reports_demo_note), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink)
        } else {
            // [[COPY-REVIEW]] the not-configured note and the sample note below it.
            Text(stringResource(R.string.reports_not_configured), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink)
            Text(stringResource(R.string.reports_sample_note), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
        }
    }
}

/** One group (weekly or monthly) as a ledger sheet of rows. */
@Composable
private fun ReportGroup(title: String, reports: List<ReportSummary>, locale: Locale, onOpenReport: (String) -> Unit) {
    Sheet(title = title, padding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp)) {
        reports.forEachIndexed { i, summary ->
            val made = ReportFormat.shortDate(summary.generatedAt, locale)
            LedgerRow(
                label = periodLabel(summary, locale, compact = true),
                secondary = statusLine(summary),
                onClick = { onOpenReport(summary.reportId) },
                showRule = i < reports.lastIndex,
            ) {
                if (made != null) {
                    Text(made, style = MaterialTheme.typography.bodySmall.tabular(), color = HesabuTheme.colors.inkSoft)
                }
            }
        }
    }
}

/** The outcome of "Generate this week's report", announced politely to TalkBack. */
@Composable
private fun GenerateNote(generate: ReportsViewModel.GenerateState) {
    val live = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
    when (generate) {
        ReportsViewModel.GenerateState.Idle -> Unit
        ReportsViewModel.GenerateState.Working -> LoadingState(stringResource(R.string.reports_generate_working), live)
        ReportsViewModel.GenerateState.Queued ->
            Text(stringResource(R.string.reports_generate_queued), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink, modifier = live)
        ReportsViewModel.GenerateState.Offline ->
            Text(stringResource(R.string.reports_generate_offline), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink, modifier = live)
        is ReportsViewModel.GenerateState.Failed -> ErrorState(
            title = stringResource(R.string.reports_generate_failed),
            body = stringResource(generate.error.bodyRes),
            modifier = live,
        )
    }
}
