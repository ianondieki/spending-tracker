package ke.hesabu.app

import android.content.Context
import ke.hesabu.app.data.BodyCipher
import ke.hesabu.app.data.DatabaseKey
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.KeystoreBodyCipher
import ke.hesabu.app.data.KeystoreSecretStore
import ke.hesabu.app.data.SecretStore
import ke.hesabu.app.data.SettingsRepository
import ke.hesabu.app.data.Taxonomy
import ke.hesabu.app.data.settingsDataStore
import ke.hesabu.app.ingest.IngestPipeline
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.PackLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Hand-wired dependency graph (no DI framework in the sprint build). Everything is lazy so that the Application
 * class, receivers and Robolectric tests do not touch SQLCipher or the Keystore until something needs them.
 * Tests build their own graph with [HesabuDatabase.inMemory] and a test cipher.
 */
open class AppGraph(
    private val context: Context,
    dbFactory: (Context) -> HesabuDatabase = { HesabuDatabase.open(it, DatabaseKey.getOrCreate(it)) },
    cipherFactory: () -> BodyCipher = { KeystoreBodyCipher() },
    secretsFactory: (Context) -> SecretStore = { KeystoreSecretStore(it) },
) {
    val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val settings: SettingsRepository by lazy { SettingsRepository(context.settingsDataStore) }
    val secrets: SecretStore by lazy { secretsFactory(context) }
    val db: HesabuDatabase by lazy { dbFactory(context) }
    val bodyCipher: BodyCipher by lazy { cipherFactory() }

    /** Packs from the APK; the SIM mask comes from settings so the account key is stable per install. */
    val engine: PackEngine by lazy {
        val sim = runBlocking { settings.current().simMsisdnMasked }.ifEmpty { "default" }
        PackEngine(PackLoader.fromAssets(context), mapOf("sim_msisdn_masked" to sim))
    }

    val pipeline: IngestPipeline by lazy { IngestPipeline(db, engine, bodyCipher) }

    /** The one way to build an API client: the cleartext policy comes from Settings, the token from the secret store. */
    fun syncClient(url: String, engine: io.ktor.client.engine.HttpClientEngine? = null) = ke.hesabu.app.sync.SyncClient(
        url, { secrets.deviceToken }, engine, cleartextAllowed = { runBlocking { settings.current().allowCleartext } },
    )

    private val taxonomyMutex = Mutex()
    private var taxonomySeeded = false

    /** Loads categories and merchant seeds into the ledger once per process (idempotent upserts). */
    suspend fun ensureTaxonomy() = taxonomyMutex.withLock {
        if (taxonomySeeded) return@withLock
        val loaded = Taxonomy.fromAssets(context)
        if (loaded != null) {
            db.categoryDao().upsertAll(loaded.categories)
            db.merchantSeedDao().upsertAll(loaded.seeds)
        }
        taxonomySeeded = true
    }

    suspend fun currentSettings() = settings.settings.first()
}
