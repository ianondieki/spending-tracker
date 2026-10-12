package ke.hesabu.app.data

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.SecureRandom

/**
 * Holds the SQLCipher passphrase in EncryptedSharedPreferences, itself wrapped by an Android
 * Keystore master key. Generated once per install; losing it means the ledger is unreadable,
 * which is the intended fail-closed behaviour (the ledger can be rebuilt from the inbox).
 */
object DatabaseKey {

    private const val PREFS = "hesabu.keys"
    private const val KEY = "db_passphrase"
    private const val KEY_BYTES = 32

    fun getOrCreate(context: Context): ByteArray {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        val prefs = EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
        prefs.getString(KEY, null)?.let { return Base64.decode(it, Base64.NO_WRAP) }

        val fresh = ByteArray(KEY_BYTES).also { SecureRandom().nextBytes(it) }
        prefs.edit().putString(KEY, Base64.encodeToString(fresh, Base64.NO_WRAP)).apply()
        return fresh
    }
}
