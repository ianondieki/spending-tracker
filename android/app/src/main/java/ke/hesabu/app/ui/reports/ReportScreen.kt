package ke.hesabu.app.ui.reports

import android.content.ActivityNotFoundException
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ke.hesabu.app.R
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.Section
import ke.hesabu.app.ui.charts.ReportChart
import ke.hesabu.app.ui.components.EmptyState
import ke.hesabu.app.ui.components.ErrorState
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.LoadingState
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.components.SkeletonRows

/**
 * One report, rendered natively from its ReportDocument: every section type in order (hero tally, KPIs, charts,
 * insights, tables, lists, callouts, the watch list, the footer), with chart data read from the FactsSheet.
 * The top bar's share action offers the hero image and the PDF through the Android share sheet.
 */
@Composable
fun ReportScreen(reportId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val repository = remember { ReportsRepository.get(context) }
    val downloader = remember { ReportArtefactDownloader.create(context) }
    val vm: ReportViewModel = viewModel(key = "report:$reportId", factory = ReportViewModel.factory(reportId, repository, downloader))
    val state by vm.state.collectAsStateWithLifecycle()
    val share by vm.shareState.collectAsStateWithLifecycle()
    val chooserTitle = stringResource(R.string.report_share_chooser)
    LaunchedEffect(vm) {
        vm.shareEvents.collect { file ->
            try {
                context.startActivity(ReportShareIntent.chooser(context, file, chooserTitle))
            } catch (e: ActivityNotFoundException) {
                // No app can receive the file; the share state already returned to idle.
            }
        }
    }
    ReportScreenContent(
        state = state,
        share = share,
        onBack = onBack,
        onRetry = { vm.load(refresh = true) },
        onShare = vm::share,
        onDismissShareError = vm::dismissShareError,
    )
}

/** Stateless body of [ReportScreen], for tests and previews. */
@Composable
fun ReportScreenContent(
    state: ReportViewModel.UiState,
    share: ReportViewModel.ShareState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onShare: (ShareKind) -> Unit,
    onDismissShareError: () -> Unit = {},
) {
    val ready = state as? ReportViewModel.UiState.Ready
    val document = ready?.detail?.document
    HesabuScreen(
        title = document?.title ?: stringResource(R.string.report_title_fallback),
        subtitle = document?.periodLabel,
        onBack = onBack,
        actions = if (ready != null) {
            { ShareMenu(ready.detail.summary.artefacts, enabled = share !is ReportViewModel.ShareState.Preparing, onShare = onShare) }
        } else {
            null
        },
    ) {
        when (state) {
            ReportViewModel.UiState.Loading -> {
                val loading = stringResource(R.string.report_loading)
                Sheet(Modifier.semantics { contentDescription = loading }) { SkeletonRows(count = 7) }
                Sheet { SkeletonRows(count = 3) }
            }
            is ReportViewModel.UiState.Failed -> ErrorState(
                title = stringResource(R.string.report_error_title),
                body = stringResource(state.error.bodyRes),
                retryLabel = stringResource(R.string.action_retry),
                onRetry = onRetry,
            )
            is ReportViewModel.UiState.NotReady -> NotReady(state, onRetry)
            is ReportViewModel.UiState.Ready -> {
                ShareStatus(share, onShare, onDismissShareError)
                ReportBody(state.detail)
            }
        }
    }
}

/** Every section of the document, in order. */
@Composable
fun ColumnScope.ReportBody(detail: ReportDetail) {
    val document = detail.document ?: return
    val facts = detail.facts
    document.sections.forEach { section ->
        when (section) {
            is Section.Hero -> HeroSection(section, facts, document.kind, revealKey = document.reportId)
            is Section.Kpis -> KpisSection(section)
            is Section.Chart -> ReportChart(section, facts, document.locale)
            is Section.Insights -> InsightsSection(section)
            is Section.Table -> TableSection(section)
            is Section.ListSection -> ListSection(section)
            is Section.Callout -> CalloutSection(section)
            is Section.Watch -> WatchSection(section)
            is Section.Footer -> FooterSection(section)
        }
    }
}

@Composable
private fun NotReady(state: ReportViewModel.UiState.NotReady, onRetry: () -> Unit) {
    if (state.summary.status == "failed") {
        ErrorState(
            title = stringResource(R.string.report_failed_title),
            body = stringResource(R.string.report_failed_body),
            retryLabel = stringResource(R.string.action_retry),
            onRetry = onRetry,
        )
    } else {
        EmptyState(
            title = stringResource(R.string.report_not_ready_title),
            body = stringResource(R.string.report_not_ready_body, statusText(state.summary.status)),
            actionLabel = stringResource(R.string.report_check_again),
            onAction = onRetry,
        )
    }
}

/** Preparing a file, or why it could not be prepared; nothing when idle. */
@Composable
private fun ShareStatus(share: ReportViewModel.ShareState, onShare: (ShareKind) -> Unit, onDismiss: () -> Unit) {
    when (share) {
        ReportViewModel.ShareState.Idle -> Unit
        is ReportViewModel.ShareState.Preparing -> LoadingState(
            stringResource(if (share.kind == ShareKind.Image) R.string.report_share_preparing_image else R.string.report_share_preparing_pdf),
        )
        is ReportViewModel.ShareState.Failed -> ErrorState(
            title = stringResource(R.string.report_share_failed_title),
            body = stringResource(R.string.report_share_failed_body),
            retryLabel = stringResource(R.string.action_retry),
            onRetry = { onDismiss(); onShare(share.kind) },
        )
    }
}
