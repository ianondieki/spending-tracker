package ke.hesabu.app.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.SecureRandom

/**
 * Holds the SQLCipher passphrase in EncryptedSharedPreferences, itself wrapped by an Android
 * Keystore master key. Generated once per install; losing it means the ledger is unreadable,
 * which is the intended fail-closed behaviour (the ledger can be rebuilt from the inbox).
 *
 * Opening the encrypted preferences is the one Keystore call every launch depends on, and on some phones it fails
 * once with a corrupt or unusable keyset (after a restore, an OS update or a Keystore hiccup). That case is retried
 * once with a fresh keyset; a ledger that the lost passphrase protected is then deleted rather than left unopenable,
 * exactly as the fail-closed rule above says. A second failure surfaces as [StorageUnavailable] so the start-up
 * screen can say what happened instead of the process dying.
 */
object DatabaseKey {

    private const val PREFS = "hesabu.keys"
    private const val KEY = "db_passphrase"
    private const val KEY_BYTES = 32
    private const val TAG = "DatabaseKey"

    /** Secure storage could not be opened even after a reset; the message names the underlying failure. */
    class StorageUnavailable(cause: Throwable) :
        IllegalStateException("Secure storage unavailable: ${cause.javaClass.simpleName}: ${cause.message}", cause)

    fun getOrCreate(context: Context): ByteArray {
        val prefs = try {
            openPrefs(context)
        } catch (first: Exception) {
            Log.w(TAG, "Encrypted preferences failed to open (${first.javaClass.simpleName}); resetting the keyset once")
            context.deleteSharedPreferences(PREFS)
            try {
                openPrefs(context)
            } catch (second: Exception) {
                throw StorageUnavailable(second)
            }
        }
        prefs.getString(KEY, null)?.let { return Base64.decode(it, Base64.NO_WRAP) }

        // No passphrase: either a fresh install or a lost keyset. A ledger left from a lost keyset can never be
        // opened again, so it goes, and the inbox backfill rebuilds it.
        if (context.getDatabasePath(HesabuDatabase.NAME).exists()) {
            Log.w(TAG, "Passphrase missing but a ledger exists; deleting the unreadable ledger")
            context.deleteDatabase(HesabuDatabase.NAME)
        }
        val fresh = ByteArray(KEY_BYTES).also { SecureRandom().nextBytes(it) }
        prefs.edit().putString(KEY, Base64.encodeToString(fresh, Base64.NO_WRAP)).apply()
        return fresh
    }

    private fun openPrefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
}
