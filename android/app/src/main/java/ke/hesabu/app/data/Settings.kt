package ke.hesabu.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

/** App preferences (non-secret). Secrets such as the device token go through [SecretStore]. */
val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "hesabu.settings")

object SettingsKeys {
    /** The user has seen the prominent disclosure and granted SMS access. */
    val SmsConsentGiven = booleanPreferencesKey("sms_consent_given")
    /** The user allows redacted unknown messages to go to the AI extractor. Off by default. */
    val AiFallbackConsent = booleanPreferencesKey("ai_fallback_consent")
    /** Epoch millis of the last completed backfill, absent until the first one finishes. */
    val LastBackfillAt = longPreferencesKey("last_backfill_at")
    /** Epoch millis of the last reconciliation scan. */
    val LastReconcileAt = longPreferencesKey("last_reconcile_at")
    /** How far back the inbox backfill reads. */
    val BackfillMonths = intPreferencesKey("backfill_months")
    /** IANA zone used for weeks and report periods; Kenyan by default. */
    val TimeZone = stringPreferencesKey("time_zone")
    val ServerUrl = stringPreferencesKey("server_url")
    val Email = stringPreferencesKey("email")
    val WhatsappE164 = stringPreferencesKey("whatsapp_e164")
    /** en | sw */
    val Locale = stringPreferencesKey("locale")
    /** e.g. "SUN 19:30" */
    val WeeklyAt = stringPreferencesKey("weekly_at")
    /** e.g. "1 07:30" */
    val MonthlyAt = stringPreferencesKey("monthly_at")
    /** light | dark | system */
    val Theme = stringPreferencesKey("theme")
    val DemoMode = booleanPreferencesKey("demo_mode")
    /** Stable per-install id sent to /v1/devices/register. */
    val DeviceId = stringPreferencesKey("device_id")
    /** Masked SIM number the user typed, used in account_ref templates. */
    val SimMsisdnMasked = stringPreferencesKey("sim_msisdn_masked")
    /** ISO time of the next report, from the last SyncResponse. */
    val NextReportAt = stringPreferencesKey("next_report_at")
    val LastSyncAt = longPreferencesKey("last_sync_at")
    val LastSyncError = stringPreferencesKey("last_sync_error")
    /** The user dismissed the OEM background-restriction guidance. */
    val OemGuidanceDismissed = booleanPreferencesKey("oem_guidance_dismissed")
    val OnboardingDone = booleanPreferencesKey("onboarding_done")
    /** Developer toggle: allow an http:// server address (a laptop tunnel). Off by default; loopback never needs it. */
    val AllowCleartext = booleanPreferencesKey("allow_cleartext")
    /** The WhatsApp business number users send JOIN to; empty until the operator configures it. */
    val WhatsappBusinessNumber = stringPreferencesKey("whatsapp_business_number")
}

/** Typed view of the preferences with Kenyan defaults. */
data class AppSettings(
    val smsConsentGiven: Boolean = false,
    val aiFallbackConsent: Boolean = false,
    val lastBackfillAt: Long? = null,
    val lastReconcileAt: Long? = null,
    val backfillMonths: Int = 12,
    val timeZone: String = "Africa/Nairobi",
    val serverUrl: String = "",
    val email: String = "",
    val whatsappE164: String = "",
    val locale: String = "en",
    val weeklyAt: String = "SUN 19:30",
    val monthlyAt: String = "1 07:30",
    val theme: String = "system",
    val demoMode: Boolean = false,
    val deviceId: String = "",
    val simMsisdnMasked: String = "",
    val nextReportAt: String? = null,
    val lastSyncAt: Long? = null,
    val lastSyncError: String? = null,
    val oemGuidanceDismissed: Boolean = false,
    val onboardingDone: Boolean = false,
    val allowCleartext: Boolean = false,
    val whatsappBusinessNumber: String = "",
) {
    /** Sync is possible only when a server URL is configured; otherwise the client fails closed. */
    val syncConfigured: Boolean get() = serverUrl.startsWith("http://") || serverUrl.startsWith("https://")
}

class SettingsRepository(private val store: DataStore<Preferences>) {

    val settings: Flow<AppSettings> = store.data.map { p ->
        AppSettings(
            smsConsentGiven = p[SettingsKeys.SmsConsentGiven] ?: false,
            aiFallbackConsent = p[SettingsKeys.AiFallbackConsent] ?: false,
            lastBackfillAt = p[SettingsKeys.LastBackfillAt],
            lastReconcileAt = p[SettingsKeys.LastReconcileAt],
            backfillMonths = p[SettingsKeys.BackfillMonths] ?: 12,
            timeZone = p[SettingsKeys.TimeZone] ?: "Africa/Nairobi",
            serverUrl = p[SettingsKeys.ServerUrl] ?: "",
            email = p[SettingsKeys.Email] ?: "",
            whatsappE164 = p[SettingsKeys.WhatsappE164] ?: "",
            locale = p[SettingsKeys.Locale] ?: "en",
            weeklyAt = p[SettingsKeys.WeeklyAt] ?: "SUN 19:30",
            monthlyAt = p[SettingsKeys.MonthlyAt] ?: "1 07:30",
            theme = p[SettingsKeys.Theme] ?: "system",
            demoMode = p[SettingsKeys.DemoMode] ?: false,
            deviceId = p[SettingsKeys.DeviceId] ?: "",
            simMsisdnMasked = p[SettingsKeys.SimMsisdnMasked] ?: "",
            nextReportAt = p[SettingsKeys.NextReportAt],
            lastSyncAt = p[SettingsKeys.LastSyncAt],
            lastSyncError = p[SettingsKeys.LastSyncError],
            oemGuidanceDismissed = p[SettingsKeys.OemGuidanceDismissed] ?: false,
            onboardingDone = p[SettingsKeys.OnboardingDone] ?: false,
            allowCleartext = p[SettingsKeys.AllowCleartext] ?: false,
            whatsappBusinessNumber = p[SettingsKeys.WhatsappBusinessNumber] ?: "",
        )
    }

    suspend fun current(): AppSettings = settings.first()

    suspend fun <T> set(key: Preferences.Key<T>, value: T?) {
        store.edit { if (value == null) it.remove(key) else it[key] = value }
    }

    /** Creates the per-install device id on first use. */
    suspend fun deviceId(): String {
        val existing = current().deviceId
        if (existing.isNotEmpty()) return existing
        val fresh = UUID.randomUUID().toString()
        set(SettingsKeys.DeviceId, fresh)
        return fresh
    }
}
