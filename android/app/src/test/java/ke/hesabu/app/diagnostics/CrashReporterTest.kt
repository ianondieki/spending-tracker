package ke.hesabu.app.diagnostics

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
class CrashReporterTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun reportNamesBuildDeviceThreadAndTheWholeCauseChain() {
        val t = IllegalStateException("SQLCipher native library failed to load", UnsatisfiedLinkError("dlopen failed"))
        val report = CrashReporter.format(context, Thread.currentThread(), t, now = Instant.parse("2026-10-13T09:00:00Z"))
        val lines = report.lines()
        assertTrue(lines[0].startsWith("Hesabu "))
        assertTrue(lines[1].startsWith("Android "))
        assertEquals("At 2026-10-13T09:00:00Z on thread ${Thread.currentThread().name}", lines[2])
        assertTrue(report.contains("java.lang.IllegalStateException: SQLCipher native library failed to load"))
        assertTrue(report.contains("Caused by: java.lang.UnsatisfiedLinkError: dlopen failed"))
        assertTrue("has a frame", report.contains("\tat "))
    }

    @Test
    fun reportIsCapped() {
        val report = CrashReporter.format(context, Thread.currentThread(), RuntimeException("x".repeat(100_000)))
        assertTrue(report.length < 61_000)
        assertTrue(report.endsWith("… (truncated)"))
    }

    @Test
    fun handlerIsNeverInstalledInTheCrashProcess() {
        assertTrue(CrashReporter.isCrashProcess("ke.hesabu.app:crash"))
        assertFalse(CrashReporter.isCrashProcess("ke.hesabu.app"))
        assertFalse(CrashReporter.isCrashProcess(null))
    }
}
