package ke.hesabu.app.ui.settings

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ke.hesabu.app.R
import ke.hesabu.app.ingest.IngestPipeline
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.LoadingState
import ke.hesabu.app.ui.components.PrimaryButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.theme.HesabuTheme

/** Paste import: one or more money messages pasted as text run through the same engine as live SMS. */
@Composable
fun PasteImportScreen(onBack: () -> Unit, vm: SettingsViewModel = graphViewModel { SettingsViewModel(it) }) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    PasteImportContent(state.busy, state.importReport, state.importSkipped, onBack) { vm.importText(context, it) }
}

@Composable
fun PasteImportContent(busy: Boolean, report: IngestPipeline.Report?, skipped: Int, onBack: () -> Unit, onImport: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    HesabuScreen(title = stringResource(R.string.import_title), subtitle = stringResource(R.string.import_subtitle), onBack = onBack) {
        Sheet {
            OutlinedTextField(
                value = text, onValueChange = { text = it }, modifier = Modifier.fillMaxWidth(), minLines = 6, shape = RoundedCornerShape(4.dp),
                placeholder = { Text(stringResource(R.string.import_hint)) },
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = HesabuTheme.colors.biro, unfocusedBorderColor = HesabuTheme.colors.rule),
            )
            PrimaryButton(stringResource(R.string.import_action), { onImport(text) }, Modifier.fillMaxWidth().padding(top = 12.dp), enabled = text.isNotBlank() && !busy)
            Text(stringResource(R.string.import_privacy), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 8.dp))
        }
        if (busy) LoadingState(stringResource(R.string.import_working))
        if (report != null) {
            Sheet(title = stringResource(R.string.import_result_title)) {
                Text(pluralStringResource(R.plurals.import_result_parsed, report.parsed, report.parsed), style = MaterialTheme.typography.bodyLarge, color = HesabuTheme.colors.ink)
                if (report.duplicates > 0) Text(pluralStringResource(R.plurals.import_result_duplicates, report.duplicates, report.duplicates), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
                if (report.unknown > 0) Text(pluralStringResource(R.plurals.import_result_unknown, report.unknown, report.unknown), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
                if (report.parsed == 0 && report.duplicates == 0 && report.unknown == 0) Text(stringResource(R.string.import_result_nothing), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
            }
        }
    }
}
