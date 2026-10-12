package ke.hesabu.app.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts the body of an unknown message before it is written to the (already SQLCipher-encrypted) ledger, with a
 * non-exportable AES-256-GCM key in the Android Keystore. Bodies are the only raw text Hesabu keeps and only so
 * the user can label them in "Teach Hesabu"; they never leave the phone.
 */
interface BodyCipher {
    /** IV (12 bytes) followed by ciphertext and tag. Throws when the key store is unavailable (fail closed). */
    fun encrypt(plain: String): ByteArray
    fun decrypt(blob: ByteArray): String
}

class KeystoreBodyCipher(private val alias: String = "hesabu.unknown_body") : BodyCipher {

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    override fun encrypt(plain: String): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val iv = cipher.iv
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return iv + ct
    }

    override fun decrypt(blob: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob, 0, 12))
        return String(cipher.doFinal(blob, 12, blob.size - 12), Charsets.UTF_8)
    }
}

/** JVM tests only: no key store exists there. The name says what it is. */
class InsecureTestBodyCipher : BodyCipher {
    override fun encrypt(plain: String): ByteArray = plain.toByteArray(Charsets.UTF_8).reversedArray()
    override fun decrypt(blob: ByteArray): String = String(blob.reversedArray(), Charsets.UTF_8)
}
