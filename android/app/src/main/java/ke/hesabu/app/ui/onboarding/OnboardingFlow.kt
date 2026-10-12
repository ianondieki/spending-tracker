package ke.hesabu.app.ui.onboarding

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.work.WorkInfo
import androidx.work.WorkManager
import ke.hesabu.app.HesabuApplication
import ke.hesabu.app.data.SettingsKeys
import ke.hesabu.app.ingest.BackfillProgress
import ke.hesabu.app.ingest.BackfillWorker
import ke.hesabu.app.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** The onboarding steps as a tiny state machine; each step is a stateless screen. */
enum class OnboardingStep { Welcome, Disclosure, Backfill, Oem }

@Composable
fun OnboardingFlow(onFinished: () -> Unit) {
    val context = LocalContext.current
    val graph = remember { HesabuApplication.graph(context) }
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(OnboardingStep.Welcome) }
    val settings by graph.settings.settings.collectAsStateWithLifecycle(initialValue = null)

    fun finish() {
        scope.launch {
            graph.settings.set(SettingsKeys.OnboardingDone, true)
            onFinished()
        }
    }

    val requestPermissions = PermissionStep { smsGranted, _ ->
        scope.launch {
            graph.settings.set(SettingsKeys.SmsConsentGiven, smsGranted)
            if (smsGranted) {
                BackfillWorker.start(context, settings?.backfillMonths ?: 12)
                BackfillWorker.schedulePeriodicReconcile(context)
                SyncScheduler.schedulePeriodic(context)
                step = OnboardingStep.Backfill
            } else {
                finish()
            }
        }
    }

    when (step) {
        OnboardingStep.Welcome -> WelcomeScreen(onContinue = { step = OnboardingStep.Disclosure }, onSkipToImport = { finish() })
        OnboardingStep.Disclosure -> DisclosureScreen(
            senders = remember { graph.engine.packs.flatMap { it.senderIds }.distinct().sorted() },
            onAllow = requestPermissions,
            onNotNow = { finish() },
        )
        OnboardingStep.Backfill -> {
            val state by rememberBackfillState(context).collectAsState(initial = BackfillUiState())
            BackfillScreen(
                state = state,
                months = settings?.backfillMonths ?: 12,
                onContinue = { step = OnboardingStep.Oem },
                onSkip = { step = OnboardingStep.Oem },
            )
        }
        OnboardingStep.Oem -> {
            val oem = remember { OemGuidance.detect() }
            OemGuidanceScreen(
                oem = oem,
                onOpenSettings = { runCatching { context.startActivity(OemGuidance.batterySettingsIntent(context)) } },
                onDone = {
                    scope.launch { graph.settings.set(SettingsKeys.OemGuidanceDismissed, true) }
                    finish()
                },
            )
        }
    }

    LaunchedEffect(Unit) { graph.ensureTaxonomy() }
}

/** Observes the unique backfill work and maps its progress to the screen state. */
fun rememberBackfillState(context: Context): Flow<BackfillUiState> =
    WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(BackfillWorker.UNIQUE_NAME).map { infos ->
        val info = infos.firstOrNull() ?: return@map BackfillUiState()
        val data = if (info.state == WorkInfo.State.SUCCEEDED) info.outputData else info.progress
        BackfillUiState(
            total = data.getInt(BackfillProgress.TOTAL, 0),
            done = data.getInt(BackfillProgress.DONE, 0),
            parsed = data.getInt(BackfillProgress.PARSED, 0),
            unknown = data.getInt(BackfillProgress.UNKNOWN, 0),
            perSender = BackfillProgress.perSender(data),
            finished = info.state == WorkInfo.State.SUCCEEDED,
            failed = info.state == WorkInfo.State.FAILED || info.state == WorkInfo.State.CANCELLED,
        )
    }
