package ke.hesabu.app.ui.reports

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URL

/** Where a share download may go, and when the device token may travel with it. URLs compare as strings (URL.equals resolves hosts). */
class ReportArtefactDownloaderTest {

    private val server = "https://api.hesabu.example/"

    @Test
    fun absoluteHttpUrlsAreUsedAsGiven() {
        assertEquals("https://cdn.example/r/hero.png", ReportArtefactDownloader.resolve("https://cdn.example/r/hero.png", server).toString())
    }

    @Test
    fun relativePathsResolveAgainstTheServerOnlyWhenOneIsConfigured() {
        assertEquals("https://api.hesabu.example/v1/files/hero.png", ReportArtefactDownloader.resolve("/v1/files/hero.png", server).toString())
        assertNull(ReportArtefactDownloader.resolve("/v1/files/hero.png", ""))
    }

    @Test
    fun otherSchemesAreRefused() {
        assertNull(ReportArtefactDownloader.resolve("file:///data/data/ke.hesabu.app/secret", server))
        assertNull(ReportArtefactDownloader.resolve("content://evil/hero.png", server))
        assertNull(ReportArtefactDownloader.resolve("javascript:alert(1)", server))
        assertNull(ReportArtefactDownloader.resolve("not a url at all", server))
    }

    @Test
    fun theTokenOnlyGoesToTheConfiguredServer() {
        assertTrue(ReportArtefactDownloader.sameHost(URL("https://api.hesabu.example/v1/x"), server))
        assertFalse(ReportArtefactDownloader.sameHost(URL("https://cdn.example/x"), server))
        assertFalse(ReportArtefactDownloader.sameHost(URL("http://api.hesabu.example/v1/x"), server))
        assertFalse(ReportArtefactDownloader.sameHost(URL("https://api.hesabu.example:8443/x"), server))
        assertFalse(ReportArtefactDownloader.sameHost(URL("https://api.hesabu.example/x"), ""))
    }

    @Test
    fun cacheFileNamesAreSafe() {
        assertEquals("rep_2026-10-05", ReportArtefactDownloader.safeName("rep_2026-10-05"))
        assertEquals("______etc_passwd", ReportArtefactDownloader.safeName("../../etc/passwd"))
        assertEquals("report", ReportArtefactDownloader.safeName(""))
    }
}
