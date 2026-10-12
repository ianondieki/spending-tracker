@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package ke.hesabu.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ke.hesabu.app.R
import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.data.SettingsKeys
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.KeyValue
import ke.hesabu.app.ui.components.QuietButton
import ke.hesabu.app.ui.components.SecondaryButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.graphViewModel
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.transactions.ToggleRow

/** Settings: server, delivery, language, report times, consents, demo mode, import, parsers, about. */
@Composable
fun SettingsScreen(
    onOpenImport: () -> Unit,
    onOpenOemHelp: () -> Unit,
    onOpenDisclosure: () -> Unit,
    vm: SettingsViewModel = graphViewModel { SettingsViewModel(it) },
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    SettingsContent(
        state,
        onServerUrl = vm::setServerUrl,
        onEmail = { vm.set(SettingsKeys.Email, it.trim()) },
        onWhatsapp = { vm.set(SettingsKeys.WhatsappE164, it.trim()) },
        onNumber = vm::setMsisdn,
        onAllowCleartext = { vm.set(SettingsKeys.AllowCleartext, it) },
        onLocale = { vm.set(SettingsKeys.Locale, it) },
        onWeeklyAt = { vm.set(SettingsKeys.WeeklyAt, it) },
        onMonthlyAt = { vm.set(SettingsKeys.MonthlyAt, it) },
        onTheme = { vm.set(SettingsKeys.Theme, it) },
        onAiConsent = { vm.set(SettingsKeys.AiFallbackConsent, it) },
        onDemo = { vm.setDemoMode(context, it) },
        onSyncNow = vm::syncNow,
        onRescan = { vm.rescanInbox(context) },
        onOpenImport = onOpenImport,
        onOpenOemHelp = onOpenOemHelp,
        onOpenDisclosure = onOpenDisclosure,
        onDismissMessage = vm::clearMessage,
    )
}

@Composable
fun SettingsContent(
    state: SettingsViewModel.State,
    onServerUrl: (String) -> Unit = {},
    onEmail: (String) -> Unit = {},
    onWhatsapp: (String) -> Unit = {},
    onNumber: (String) -> Unit = {},
    onAllowCleartext: (Boolean) -> Unit = {},
    onLocale: (String) -> Unit = {},
    onWeeklyAt: (String) -> Unit = {},
    onMonthlyAt: (String) -> Unit = {},
    onTheme: (String) -> Unit = {},
    onAiConsent: (Boolean) -> Unit = {},
    onDemo: (Boolean) -> Unit = {},
    onSyncNow: () -> Unit = {},
    onRescan: () -> Unit = {},
    onOpenImport: () -> Unit = {},
    onOpenOemHelp: () -> Unit = {},
    onOpenDisclosure: () -> Unit = {},
    onDismissMessage: () -> Unit = {},
) {
    val s = state.settings
    HesabuScreen(title = stringResource(R.string.nav_settings)) {
        state.message?.let { m ->
            Sheet {
                Text(messageText(m), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink)
                QuietButton(stringResource(R.string.action_done), onDismissMessage)
            }
        }

        Sheet(title = stringResource(R.string.settings_server_title)) {
            Text(stringResource(R.string.settings_server_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
            SavedField(s.serverUrl, stringResource(R.string.settings_server_label), KeyboardType.Uri, onServerUrl)
            KeyValue(stringResource(R.string.settings_sync_queue), state.queued.toString())
            s.lastSyncError?.let { Text(stringResource(R.string.settings_sync_error, it), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.warn) }
            ToggleRow(stringResource(R.string.settings_allow_http), s.allowCleartext, onAllowCleartext)
            Text(stringResource(R.string.settings_allow_http_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton(stringResource(R.string.settings_sync_now), onSyncNow, enabled = s.syncConfigured && !state.busy)
            }
        }

        Sheet(title = stringResource(R.string.settings_number_title)) {
            Text(stringResource(R.string.settings_number_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
            SavedField(s.simMsisdnMasked, stringResource(R.string.settings_number_label), KeyboardType.Phone, onNumber)
        }

        Sheet(title = stringResource(R.string.settings_delivery_title)) {
            Text(stringResource(R.string.settings_delivery_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
            SavedField(s.email, stringResource(R.string.settings_email), KeyboardType.Email, onEmail)
            SavedField(s.whatsappE164, stringResource(R.string.settings_whatsapp), KeyboardType.Phone, onWhatsapp)
            SavedField(s.weeklyAt, stringResource(R.string.settings_weekly_at), KeyboardType.Text, onWeeklyAt)
            SavedField(s.monthlyAt, stringResource(R.string.settings_monthly_at), KeyboardType.Text, onMonthlyAt)
        }

        Sheet(title = stringResource(R.string.settings_language_title)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Choice(s.locale == "en", "English") { onLocale("en") }
                Choice(s.locale == "sw", "Kiswahili") { onLocale("sw") }
            }
            Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 12.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Choice(s.theme == "system", stringResource(R.string.settings_theme_system)) { onTheme("system") }
                Choice(s.theme == "light", stringResource(R.string.settings_theme_light)) { onTheme("light") }
                Choice(s.theme == "dark", stringResource(R.string.settings_theme_dark)) { onTheme("dark") }
            }
        }

        Sheet(title = stringResource(R.string.settings_privacy_title)) {
            KeyValue(stringResource(R.string.settings_sms_consent), stringResource(if (s.smsConsentGiven) R.string.settings_on else R.string.settings_off))
            QuietButton(stringResource(R.string.settings_sms_review), onOpenDisclosure)
            ToggleRow(stringResource(R.string.settings_ai_consent), s.aiFallbackConsent, onAiConsent)
            Text(stringResource(R.string.settings_ai_consent_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
            KeyValue(stringResource(R.string.settings_unknown_pending), state.unknownPending.toString())
            Text(stringResource(R.string.settings_privacy_note), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 8.dp))
        }

        Sheet(title = stringResource(R.string.settings_messages_title)) {
            SecondaryButton(stringResource(R.string.settings_import_paste), onOpenImport, Modifier.fillMaxWidth())
            SecondaryButton(stringResource(R.string.settings_rescan), onRescan, Modifier.fillMaxWidth().padding(top = 8.dp), enabled = s.smsConsentGiven && !state.busy)
            QuietButton(stringResource(R.string.settings_oem_help), onOpenOemHelp, Modifier.fillMaxWidth())
            ToggleRow(stringResource(R.string.settings_demo_mode), s.demoMode) { if (!state.busy) onDemo(it) }
            Text(stringResource(R.string.settings_demo_body), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
        }

        Sheet(title = stringResource(R.string.settings_parsers_title)) {
            state.packs.forEach { p -> KeyValue("${p.id} ${p.version}", stringResource(R.string.settings_pack_detail, p.families, p.senders)) }
            KeyValue(stringResource(R.string.settings_app_version), state.appVersion)
        }
    }
}

@Composable
private fun messageText(m: String): String = when {
    m.startsWith("demo_on:") -> stringResource(R.string.settings_demo_loaded, m.substringAfter(':').toIntOrNull() ?: 0)
    m.startsWith("demo_off:") -> stringResource(R.string.settings_demo_removed, m.substringAfter(':').toIntOrNull() ?: 0)
    m.startsWith("sync:done") -> stringResource(R.string.settings_sync_done)
    m.startsWith("sync:nothingtodo") -> stringResource(R.string.settings_sync_nothing)
    m.startsWith("sync:notconfigured") -> stringResource(R.string.settings_sync_not_configured)
    m.startsWith("sync:cleartextblocked") -> stringResource(R.string.settings_sync_cleartext_blocked)
    m.startsWith("sync:") -> stringResource(R.string.settings_sync_failed)
    m == "rescan" -> stringResource(R.string.settings_rescan_started)
    else -> m
}

/** A text field that saves on focus loss or Done. */
@Composable
private fun SavedField(value: String, label: String, keyboard: KeyboardType, onSave: (String) -> Unit) {
    var text by rememberSaveable(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = text,
        onValueChange = { text = it },
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        label = { Text(label) },
        singleLine = true,
        shape = RoundedCornerShape(4.dp),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = HesabuTheme.colors.biro, unfocusedBorderColor = HesabuTheme.colors.rule),
    )
    if (text != value) QuietButton(stringResource(R.string.action_save), { onSave(text) })
}

@Composable
private fun Choice(selected: Boolean, label: String, onClick: () -> Unit) {
    FilterChip(
        selected = selected, onClick = onClick, label = { Text(label) }, shape = RoundedCornerShape(4.dp),
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = HesabuTheme.colors.biro, selectedLabelColor = HesabuTheme.colors.onBiro, containerColor = HesabuTheme.colors.paper, labelColor = HesabuTheme.colors.ink),
        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected, borderColor = HesabuTheme.colors.rule, selectedBorderColor = HesabuTheme.colors.biro),
    )
}
