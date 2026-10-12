package ke.hesabu.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * The on-device ledger. Encrypted at rest with SQLCipher; the passphrase comes from
 * [DatabaseKey] (Android Keystore-backed) and is never written to disk in the clear.
 *
 * Schema version 1 is the first real schema (the scaffold's placeholder never shipped); the exported JSON under
 * app/schemas/ is the baseline future migrations are tested against.
 */
@Database(
    entities = [
        TransactionEntity::class, AccountEntity::class, UnknownMessageEntity::class,
        CategoryEntity::class, MerchantSeedEntity::class, UserRuleEntity::class, SyncQueueEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class HesabuDatabase : RoomDatabase() {

    abstract fun transactionDao(): TransactionDao
    abstract fun accountDao(): AccountDao
    abstract fun unknownMessageDao(): UnknownMessageDao
    abstract fun categoryDao(): CategoryDao
    abstract fun merchantSeedDao(): MerchantSeedDao
    abstract fun userRuleDao(): UserRuleDao
    abstract fun syncQueueDao(): SyncQueueDao

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

        /** Builds the encrypted database. Callers keep a single instance (see [ke.hesabu.app.HesabuApplication]). */
        fun open(context: Context, passphrase: ByteArray): HesabuDatabase {
            loadNativeLibrary()
            return Room.databaseBuilder(context.applicationContext, HesabuDatabase::class.java, NAME)
                .openHelperFactory(SupportOpenHelperFactory(passphrase))
                .build()
        }

        /** Plain in-memory SQLite, for JVM tests under Robolectric where SQLCipher's native library is absent. */
        fun inMemory(context: Context): HesabuDatabase =
            Room.inMemoryDatabaseBuilder(context.applicationContext, HesabuDatabase::class.java)
                .allowMainThreadQueries()
                .build()
    }
}
