package ke.hesabu.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.InMemorySecretStore
import ke.hesabu.app.data.InsecureTestBodyCipher
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Start-up opens storage once and reports a failure as a value, never as an exception on a screen. */
@RunWith(RobolectricTestRunner::class)
class AppGraphWarmUpTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun graph(dbFactory: (Context) -> HesabuDatabase = { HesabuDatabase.inMemory(it) }) =
        AppGraph(context, dbFactory = dbFactory, cipherFactory = { InsecureTestBodyCipher() }, secretsFactory = { InMemorySecretStore() })

    @Test
    fun warmUpOpensTheLedgerCompilesPacksAndSeedsTaxonomy() = runTest {
        val g = graph()
        assertTrue(g.warmUp().isSuccess)
        assertTrue("packs compiled", g.engine.packs.isNotEmpty())
        assertTrue("taxonomy seeded", g.db.categoryDao().observeAll().first().isNotEmpty())
        // Idempotent: a second warm-up is a no-op success.
        assertTrue(g.warmUp().isSuccess)
    }

    @Test
    fun warmUpReportsAStorageFailureInsteadOfThrowing() = runTest {
        val g = graph(dbFactory = { throw IllegalStateException("Secure storage unavailable: KeyStoreException: boom") })
        val result = g.warmUp()
        assertTrue(result.isFailure)
        assertEquals("Secure storage unavailable: KeyStoreException: boom", result.exceptionOrNull()?.message)
    }

    @Test
    fun warmUpRetriesAfterAFailure() = runTest {
        var attempts = 0
        val g = graph(dbFactory = { c -> attempts++; if (attempts == 1) throw IllegalStateException("first open fails") else HesabuDatabase.inMemory(c) })
        assertTrue(g.warmUp().isFailure)
        assertTrue(g.warmUp().isSuccess)
        assertEquals(2, attempts)
    }
}
