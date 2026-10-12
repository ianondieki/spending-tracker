package ke.hesabu.app.ui.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ke.hesabu.app.AppGraph
import ke.hesabu.app.BuildConfig
import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.data.SettingsKeys
import ke.hesabu.app.ingest.BackfillWorker
import ke.hesabu.app.ingest.DemoMode
import ke.hesabu.app.ingest.IngestPipeline
import ke.hesabu.app.ingest.TextImport
import ke.hesabu.app.parse.pack.MessageSource
import ke.hesabu.app.sync.SyncClient
import ke.hesabu.app.sync.SyncScheduler
import ke.hesabu.app.sync.Syncer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Settings: preferences, consents, demo mode, manual sync and the paste import. */
class SettingsViewModel(private val graph: AppGraph) : ViewModel() {

    data class Pack(val id: String, val version: String, val provider: String, val families: Int, val senders: String)

    data class State(
        val settings: AppSettings = AppSettings(),
        val packs: List<Pack> = emptyList(),
        val appVersion: String = BuildConfig.VERSION_NAME,
        val queued: Int = 0,
        val unknownPending: Int = 0,
        val busy: Boolean = false,
        val message: String? = null,
        val importReport: IngestPipeline.Report? = null,
        val importSkipped: Int = 0,
        /** What the pasted text would become; nothing is written until the user confirms. */
        val importPreview: TextImport.Preview? = null,
    )

    private val transient = MutableStateFlow(State())

    val state: StateFlow<State> = combine(graph.settings.settings, graph.db.syncQueueDao().observeCount(), graph.db.unknownMessageDao().observePendingCount(), transient) { s, q, u, t ->
        t.copy(
            settings = s,
            queued = q,
            unknownPending = u,
            packs = graph.engine.packs.map { Pack(it.packId, it.version, it.provider, it.families.size, it.senderIds.joinToString(", ")) },
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), State())

    fun <T> set(key: Preferences.Key<T>, value: T?) = viewModelScope.launch { graph.settings.set(key, value) }

    fun setServerUrl(url: String) = viewModelScope.launch {
        graph.settings.set(SettingsKeys.ServerUrl, url.trim())
        // A new server means a new registration.
        graph.secrets.deviceToken = null
    }

    /** Stored masked (07XXXXX123); the full number never persists. Takes effect for messages read from now on. */
    fun setMsisdn(raw: String) = viewModelScope.launch {
        val masked = ke.hesabu.app.parse.pack.Normalisers.phone(raw) ?: ""
        graph.settings.set(SettingsKeys.SimMsisdnMasked, masked)
    }

    fun setDemoMode(context: Context, on: Boolean) = viewModelScope.launch {
        transient.value = transient.value.copy(busy = true, message = null)
        val demo = DemoMode(context, graph)
        val msg = if (on) {
            val r = demo.enable()
            "demo_on:${r.parsed}"
        } else {
            "demo_off:${demo.disable()}"
        }
        transient.value = transient.value.copy(busy = false, message = msg)
    }

    fun syncNow() = viewModelScope.launch {
        transient.value = transient.value.copy(busy = true, message = null)
        val out = Syncer(graph) { url -> graph.syncClient(url) }.syncOnce()
        transient.value = transient.value.copy(busy = false, message = "sync:${out.javaClass.simpleName.lowercase()}")
    }

    fun rescanInbox(context: Context) = viewModelScope.launch {
        BackfillWorker.start(context, graph.currentSettings().backfillMonths)
        BackfillWorker.schedulePeriodicReconcile(context)
        transient.value = transient.value.copy(message = "rescan")
    }

    /** Step one: parse only. Shared and pasted text is untrusted, so the user sees the counts before anything is kept. */
    fun previewText(text: String) {
        if (text.isBlank()) return
        transient.value = transient.value.copy(importReport = null, importPreview = TextImport(graph.engine, graph.pipeline).preview(text))
    }

    /** Step two, after the confirm tap: write to the ledger and queue for sync. */
    fun importText(context: Context, text: String) = viewModelScope.launch {
        if (text.isBlank()) return@launch
        transient.value = transient.value.copy(busy = true, importReport = null, importPreview = null)
        graph.ensureTaxonomy()
        val (report, skipped) = TextImport(graph.engine, graph.pipeline).import(text, System.currentTimeMillis(), MessageSource.Import)
        if (report.parsed > 0) SyncScheduler.requestSoon(context)
        transient.value = transient.value.copy(busy = false, importReport = report, importSkipped = skipped)
    }

    fun clearMessage() { transient.value = transient.value.copy(message = null, importReport = null, importPreview = null) }
}
