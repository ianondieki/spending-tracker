package ke.hesabu.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore

/** App preferences (non-secret). Secrets such as the device token go through [DatabaseKey]-style storage. */
val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "hesabu.settings")

object SettingsKeys {
    /** The user has seen the prominent disclosure and granted SMS access. */
    val SmsConsentGiven = booleanPreferencesKey("sms_consent_given")
    /** Epoch millis of the last completed backfill, absent until the first one finishes. */
    val LastBackfillAt = stringPreferencesKey("last_backfill_at")
    /** IANA zone used for weeks and report periods; Kenyan by default. */
    val TimeZone = stringPreferencesKey("time_zone")
}
