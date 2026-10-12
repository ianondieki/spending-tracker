package ke.hesabu.app.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import ke.hesabu.app.AppGraph
import ke.hesabu.app.HesabuApplication

/** Builds a ViewModel from the app graph without a DI framework. */
class GraphViewModelFactory(private val graph: AppGraph, private val create: (AppGraph) -> ViewModel) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create(graph) as T
}

@Composable
inline fun <reified VM : ViewModel> graphViewModel(noinline create: (AppGraph) -> VM): VM {
    val context: Context = LocalContext.current
    val graph = remember { HesabuApplication.graph(context) }
    return viewModel(factory = GraphViewModelFactory(graph, create))
}

/** The graph for composables that only need to fire an action. */
@Composable
fun rememberGraph(): AppGraph {
    val context = LocalContext.current
    return remember { HesabuApplication.graph(context) }
}
