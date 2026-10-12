package ke.hesabu.app.ui.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.ReportSummary
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/** State holder for one report: the document and facts, and the two share actions (image and PDF). */
class ReportViewModel(
    private val reportId: String,
    private val repository: ReportsRepository,
    private val downloader: ReportArtefactDownloader?,
) : ViewModel() {

    sealed interface UiState {
        data object Loading : UiState
        /** The finished report. */
        data class Ready(val detail: ReportDetail) : UiState
        /** The server knows the report but it has no document yet (still being made, or it failed). */
        data class NotReady(val summary: ReportSummary) : UiState
        data class Failed(val error: LoadError) : UiState
    }

    sealed interface ShareState {
        data object Idle : ShareState
        data class Preparing(val kind: ShareKind) : ShareState
        data class Failed(val kind: ShareKind) : ShareState
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _share = MutableStateFlow<ShareState>(ShareState.Idle)
    val shareState: StateFlow<ShareState> = _share.asStateFlow()

    private val shareChannel = Channel<ShareFile>(Channel.CONFLATED)

    /** Files ready for the share sheet; the screen collects these and starts the chooser. */
    val shareEvents: Flow<ShareFile> = shareChannel.receiveAsFlow()

    init {
        load()
    }

    fun load(refresh: Boolean = false) {
        _state.value = UiState.Loading
        viewModelScope.launch {
            _state.value = try {
                val detail = repository.report(reportId, refresh)
                if (detail.document != null) UiState.Ready(detail) else UiState.NotReady(detail.summary)
            } catch (e: Exception) {
                UiState.Failed(LoadError.from(e))
            }
        }
    }

    /**
     * Downloads the artefact for [kind] and hands it to the share sheet; a missing URL does nothing. Artefact URLs
     * are signed and valid for 15 minutes, minted per request, so the summary is re-fetched right before the
     * download and the URL is never taken from the cache.
     */
    fun share(kind: ShareKind) {
        val ready = _state.value as? UiState.Ready ?: return
        val cachedUrl = when (kind) {
            ShareKind.Image -> ready.detail.summary.artefacts.heroPngUrl
            ShareKind.Pdf -> ready.detail.summary.artefacts.pdfUrl
        }
        if (cachedUrl.isNullOrBlank() || downloader == null || _share.value is ShareState.Preparing) return
        _share.value = ShareState.Preparing(kind)
        viewModelScope.launch {
            _share.value = try {
                val fresh = repository.report(reportId, refresh = true)
                val url = when (kind) {
                    ShareKind.Image -> fresh.summary.artefacts.heroPngUrl
                    ShareKind.Pdf -> fresh.summary.artefacts.pdfUrl
                } ?: throw IllegalStateException("artefact no longer available")
                _state.value = UiState.Ready(fresh)
                shareChannel.send(downloader.download(reportId, url, kind))
                ShareState.Idle
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ShareState.Failed(kind)
            }
        }
    }

    fun dismissShareError() {
        if (_share.value is ShareState.Failed) _share.value = ShareState.Idle
    }

    companion object {
        fun factory(reportId: String, repository: ReportsRepository, downloader: ReportArtefactDownloader?): ViewModelProvider.Factory =
            viewModelFactory { initializer { ReportViewModel(reportId, repository, downloader) } }
    }
}
