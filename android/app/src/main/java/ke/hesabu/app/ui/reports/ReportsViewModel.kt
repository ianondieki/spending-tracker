package ke.hesabu.app.ui.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import ke.hesabu.app.reports.ReportSummary
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** State holder for the Reports list: loading, the grouped list (or the sample), errors, and "Generate". */
class ReportsViewModel(private val repository: ReportsRepository) : ViewModel() {

    sealed interface UiState {
        data object Loading : UiState
        data class Ready(
            val weekly: List<ReportSummary>,
            val monthly: List<ReportSummary>,
            val source: ReportsRepository.Source,
            val serverConfigured: Boolean,
            val demoMode: Boolean,
        ) : UiState {
            val isEmpty: Boolean get() = weekly.isEmpty() && monthly.isEmpty()
        }
        data class Failed(val error: LoadError) : UiState
    }

    sealed interface GenerateState {
        data object Idle : GenerateState
        data object Working : GenerateState
        data object Queued : GenerateState
        data object Offline : GenerateState
        data class Failed(val error: LoadError) : GenerateState
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _generate = MutableStateFlow<GenerateState>(GenerateState.Idle)
    val generateState: StateFlow<GenerateState> = _generate.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    /** Loads the list; [refresh] bypasses the cache (the retry button and pull-to-refresh). */
    fun load(refresh: Boolean = false) {
        loadJob?.cancel()
        if (_state.value !is UiState.Ready) _state.value = UiState.Loading
        loadJob = viewModelScope.launch {
            _state.value = try {
                val listing = repository.list(refresh)
                UiState.Ready(
                    weekly = listing.reports.filter { it.kind != "monthly" },
                    monthly = listing.reports.filter { it.kind == "monthly" },
                    source = listing.source,
                    serverConfigured = listing.serverConfigured,
                    demoMode = listing.demoMode,
                )
            } catch (e: Exception) {
                UiState.Failed(LoadError.from(e))
            }
        }
    }

    /** "Generate this week's report". Offline it only explains where reports come from. */
    fun generateThisWeek() {
        if (_generate.value == GenerateState.Working) return
        _generate.value = GenerateState.Working
        viewModelScope.launch {
            _generate.value = try {
                when (repository.generate("weekly")) {
                    is ReportsRepository.Generated.Queued -> GenerateState.Queued.also { load() }
                    ReportsRepository.Generated.Offline -> GenerateState.Offline
                }
            } catch (e: Exception) {
                GenerateState.Failed(LoadError.from(e))
            }
        }
    }

    companion object {
        fun factory(repository: ReportsRepository): ViewModelProvider.Factory = viewModelFactory {
            initializer { ReportsViewModel(repository) }
        }
    }
}
