package ke.hesabu.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Small secrets (the device token) in EncryptedSharedPreferences under an Android Keystore master key. */
class SecretStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, "hesabu.secrets", masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var deviceToken: String?
        get() = prefs.getString(KEY_DEVICE_TOKEN, null)
        set(value) { prefs.edit().apply { if (value == null) remove(KEY_DEVICE_TOKEN) else putString(KEY_DEVICE_TOKEN, value) }.apply() }

    private companion object {
        const val KEY_DEVICE_TOKEN = "device_token"
    }
}
