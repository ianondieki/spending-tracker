package ke.hesabu.app.ui.onboarding

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import ke.hesabu.app.R
import ke.hesabu.app.ui.components.DoubleRule
import ke.hesabu.app.ui.components.HesabuScreen
import ke.hesabu.app.ui.components.KeyValue
import ke.hesabu.app.ui.components.LedgerRow
import ke.hesabu.app.ui.components.PrimaryButton
import ke.hesabu.app.ui.components.QuietButton
import ke.hesabu.app.ui.components.Rule
import ke.hesabu.app.ui.components.SecondaryButton
import ke.hesabu.app.ui.components.Sheet
import ke.hesabu.app.ui.theme.HesabuTheme
import ke.hesabu.app.ui.theme.tabular

/*
 * Onboarding (master prompt §12): welcome → prominent SMS disclosure → permission → backfill progress → OEM
 * guidance → done. Every step is skippable with its consequence stated. Copy is tagged [[COPY-REVIEW]] in strings.
 */

@Composable
fun WelcomeScreen(onContinue: () -> Unit, onSkipToImport: () -> Unit) {
    HesabuScreen(title = stringResource(R.string.welcome_title), subtitle = stringResource(R.string.welcome_subtitle)) {
        Sheet {
            Text(stringResource(R.string.welcome_point_1), style = MaterialTheme.typography.bodyLarge, color = HesabuTheme.colors.ink)
            Spacer(Modifier.height(12.dp)); Rule(); Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.welcome_point_2), style = MaterialTheme.typography.bodyLarge, color = HesabuTheme.colors.ink)
            Spacer(Modifier.height(12.dp)); Rule(); Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.welcome_point_3), style = MaterialTheme.typography.bodyLarge, color = HesabuTheme.colors.ink)
        }
        PrimaryButton(stringResource(R.string.action_continue), onContinue, Modifier.fillMaxWidth())
        QuietButton(stringResource(R.string.welcome_skip_import), onSkipToImport, Modifier.fillMaxWidth())
    }
}

/**
 * The prominent disclosure Google Play requires before any SMS permission request: what is read, what leaves the
 * phone, how to revoke. [senders] are the sender ids the packs know, shown so the claim is checkable.
 */
@Composable
fun DisclosureScreen(senders: List<String>, onAllow: () -> Unit, onNotNow: () -> Unit) {
    HesabuScreen(title = stringResource(R.string.disclosure_title), subtitle = stringResource(R.string.disclosure_subtitle)) {
        Sheet(title = stringResource(R.string.disclosure_reads_title)) {
            Text(stringResource(R.string.disclosure_reads_body), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink)
            if (senders.isNotEmpty()) {
                Text(
                    senders.joinToString(", "),
                    style = MaterialTheme.typography.bodyMedium.tabular(),
                    color = HesabuTheme.colors.inkSoft,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        Sheet(title = stringResource(R.string.disclosure_leaves_title)) {
            Text(stringResource(R.string.disclosure_leaves_body), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink)
        }
        Sheet(title = stringResource(R.string.disclosure_revoke_title)) {
            Text(stringResource(R.string.disclosure_revoke_body), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink)
        }
        PrimaryButton(stringResource(R.string.disclosure_allow), onAllow, Modifier.fillMaxWidth())
        QuietButton(stringResource(R.string.disclosure_not_now), onNotNow, Modifier.fillMaxWidth())
        Text(stringResource(R.string.disclosure_not_now_consequence), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
    }
}

/** Requests RECEIVE_SMS, READ_SMS and (API 33+) POST_NOTIFICATIONS, then reports what was granted. */
@Composable
fun PermissionStep(onResult: (smsGranted: Boolean, notificationsGranted: Boolean) -> Unit): () -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val sms = grants[Manifest.permission.RECEIVE_SMS] == true && grants[Manifest.permission.READ_SMS] == true
        val notif = if (Build.VERSION.SDK_INT >= 33) grants[Manifest.permission.POST_NOTIFICATIONS] == true else true
        onResult(sms, notif)
    }
    return {
        val already = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
        if (already) {
            onResult(true, Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
        } else {
            val perms = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= 33) perms += Manifest.permission.POST_NOTIFICATIONS
            launcher.launch(perms.toTypedArray())
        }
    }
}

/** Progress of the inbox backfill: a ruled column of senders and counts that adds up under a double rule. */
data class BackfillUiState(
    val total: Int = 0,
    val done: Int = 0,
    val parsed: Int = 0,
    val unknown: Int = 0,
    val perSender: Map<String, Int> = emptyMap(),
    val finished: Boolean = false,
    val failed: Boolean = false,
)

@Composable
fun BackfillScreen(state: BackfillUiState, months: Int, onContinue: () -> Unit, onSkip: () -> Unit) {
    HesabuScreen(
        title = stringResource(if (state.finished) R.string.backfill_done_title else R.string.backfill_title),
        subtitle = pluralStringResource(R.plurals.backfill_subtitle, months, months),
    ) {
        Sheet {
            val fraction = if (state.total > 0) state.done.toFloat() / state.total else 0f
            LinearProgressIndicator(
                progress = { if (state.finished) 1f else fraction },
                modifier = Modifier.fillMaxWidth().height(4.dp),
                color = HesabuTheme.colors.biro,
                trackColor = HesabuTheme.colors.rule,
            )
            Text(
                stringResource(R.string.backfill_progress, state.done, state.total),
                style = MaterialTheme.typography.bodyMedium.tabular(),
                color = HesabuTheme.colors.inkSoft,
                modifier = Modifier.padding(top = 8.dp),
            )
            Spacer(Modifier.height(12.dp))
            val rows = state.perSender.entries.sortedByDescending { it.value }
            rows.forEachIndexed { i, (sender, n) ->
                LedgerRow(label = sender.uppercase(), showRule = i < rows.size - 1) {
                    Text(n.toString(), style = HesabuTheme.money.row, color = HesabuTheme.colors.ink)
                }
            }
            if (rows.isEmpty() && !state.finished) {
                Text(stringResource(R.string.backfill_reading), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
            }
            Spacer(Modifier.height(12.dp))
            DoubleRule()
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
                Text(stringResource(R.string.backfill_total_label), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.weight(1f))
                Text(state.parsed.toString(), style = HesabuTheme.money.total, color = HesabuTheme.colors.ink)
            }
            if (state.unknown > 0) {
                Text(pluralStringResource(R.plurals.backfill_unknown, state.unknown, state.unknown), style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 8.dp))
            }
        }
        if (state.failed) {
            Text(stringResource(R.string.backfill_failed), style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.warn)
        }
        PrimaryButton(stringResource(R.string.action_continue), onContinue, Modifier.fillMaxWidth(), enabled = state.finished || state.failed)
        if (!state.finished) QuietButton(stringResource(R.string.backfill_skip), onSkip, Modifier.fillMaxWidth())
    }
}

/** Per-OEM steps to keep the SMS receiver alive, with a button to the right settings screen. */
@Composable
fun OemGuidanceScreen(oem: OemGuidance.Oem, onOpenSettings: () -> Unit, onDone: () -> Unit, onBack: (() -> Unit)? = null) {
    HesabuScreen(title = stringResource(R.string.oem_title), subtitle = stringResource(R.string.oem_subtitle, stringResource(oem.nameRes)), onBack = onBack) {
        Sheet(title = stringResource(R.string.oem_steps_title)) {
            val steps = stringResource(oem.stepsRes).split('\n').filter { it.isNotBlank() }
            steps.forEachIndexed { i, step ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("${i + 1}", style = MaterialTheme.typography.bodyLarge.tabular(), color = HesabuTheme.colors.inkSoft)
                    Text(step, style = MaterialTheme.typography.bodyLarge, color = HesabuTheme.colors.ink)
                }
                if (i < steps.size - 1) Rule()
            }
        }
        Sheet {
            KeyValue(stringResource(R.string.oem_why_label), stringResource(R.string.oem_why_value))
        }
        PrimaryButton(stringResource(R.string.oem_open_settings), onOpenSettings, Modifier.fillMaxWidth())
        SecondaryButton(stringResource(R.string.action_done), onDone, Modifier.fillMaxWidth())
    }
}

/** Remembered flag for a one-shot UI action; keeps screens stateless. */
@Composable
fun rememberOnce(): Pair<Boolean, () -> Unit> {
    var fired by remember { mutableStateOf(false) }
    return fired to { fired = true }
}
