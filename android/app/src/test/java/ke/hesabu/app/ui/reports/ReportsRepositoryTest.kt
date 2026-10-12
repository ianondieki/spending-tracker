package ke.hesabu.app.ui.reports

import ke.hesabu.app.data.AppSettings
import ke.hesabu.app.sync.SyncClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * The repository serves the bundled sample when no server is configured or demo mode is on, and never builds a
 * client in those cases (fail closed: nothing leaves the phone without a server address).
 */
class ReportsRepositoryTest {

    private var clientsBuilt = 0

    private fun repo(settings: AppSettings, sample: String? = SampleReport.text) = ReportsRepository(
        settings = { settings },
        clientFactory = { url -> clientsBuilt++; SyncClient(url, { null }) },
        sampleJson = { sample },
        io = Dispatchers.Unconfined,
    )

    @Test
    fun withoutAServerTheSampleIsListedAndOpened() = runBlocking {
        val r = repo(AppSettings(serverUrl = ""))
        val listing = r.list()
        assertEquals(ReportsRepository.Source.Sample, listing.source)
        assertFalse(listing.serverConfigured)
        assertEquals(listOf("sample-weekly-2026-10-05"), listing.reports.map { it.reportId })
        val detail = r.report("sample-weekly-2026-10-05")
        assertNotNull(detail.document)
        assertNotNull(detail.facts)
        assertSame(detail, r.report("sample-weekly-2026-10-05"))
        assertEquals(0, clientsBuilt)
    }

    @Test
    fun demoModeShowsTheSampleEvenWithAServer() = runBlocking {
        val listing = repo(AppSettings(serverUrl = "https://hesabu.example", demoMode = true)).list()
        assertEquals(ReportsRepository.Source.Sample, listing.source)
        assertTrue(listing.demoMode)
        assertTrue(listing.serverConfigured)
        assertEquals(0, clientsBuilt)
    }

    @Test
    fun generateIsANoOpOffline() = runBlocking {
        assertEquals(ReportsRepository.Generated.Offline, repo(AppSettings()).generate("weekly"))
        assertEquals(0, clientsBuilt)
    }

    @Test
    fun anUnknownReportOfflineFailsClosed() = runBlocking {
        try {
            repo(AppSettings()).report("rep_123")
            fail("expected NotConfigured")
        } catch (e: SyncClient.NotConfigured) {
            assertEquals(0, clientsBuilt)
        }
    }

    @Test
    fun aMissingOrBrokenSampleGivesAnEmptyListNotACrash() = runBlocking {
        assertTrue(repo(AppSettings(), sample = null).list().reports.isEmpty())
        val broken = repo(AppSettings(), sample = "{not json")
        assertNull(broken.sample)
        assertTrue(broken.list().reports.isEmpty())
    }
}
