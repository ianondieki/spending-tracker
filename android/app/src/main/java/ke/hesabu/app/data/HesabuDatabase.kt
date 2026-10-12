package ke.hesabu.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * The on-device ledger. Encrypted at rest with SQLCipher; the passphrase comes from
 * [DatabaseKey] (Android Keystore-backed) and is never written to disk in the clear.
 */
@Database(
    entities = [TransactionEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class HesabuDatabase : RoomDatabase() {

    abstract fun transactionDao(): TransactionDao

    companion object {
        const val NAME = "hesabu.db"

        @Volatile
        private var nativeLoaded = false

        /** Runs once per process; [open] calls it, so callers never need to. Not loadable on the JVM (unit tests). */
        fun loadNativeLibrary() {
            if (!nativeLoaded) {
                System.loadLibrary("sqlcipher")
                nativeLoaded = true
            }
        }

        /** Builds the encrypted database. Callers keep a single instance (wire DI later). */
        fun open(context: Context, passphrase: ByteArray): HesabuDatabase {
            loadNativeLibrary()
            return Room.databaseBuilder(context.applicationContext, HesabuDatabase::class.java, NAME)
                .openHelperFactory(SupportOpenHelperFactory(passphrase))
                .build()
        }
    }
}
