package ke.hesabu.app.diagnostics

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.time.Instant
import kotlin.system.exitProcess

/**
 * Debug builds only (installed from [ke.hesabu.app.HesabuApplication] when `BuildConfig.DEBUG`): an uncaught
 * exception opens [CrashActivity] in its own process with the stack trace, so a tester sees what failed and can
 * copy it, instead of the system's "keeps stopping" dialog that says nothing. The report is also written to
 * `files/last-crash.txt`. Release builds keep the platform behaviour.
 *
 * The report holds the exception chain and frames only. It never reads the ledger or the inbox; the one way
 * message text could appear is inside an exception message, which is why this stays out of release builds.
 */
object CrashReporter {

    const val FILE_NAME = "last-crash.txt"
    private const val MAX_CHARS = 60_000
    private const val TAG = "CrashReporter"
    private const val PROCESS_SUFFIX = ":crash"

    fun install(app: Application) {
        if (isCrashProcess(currentProcessName(app))) return
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val report = runCatching { format(app, thread, throwable) }.getOrElse { "Report failed: $it\n\n$throwable" }
            runCatching { File(app.filesDir, FILE_NAME).writeText(report) }
            Log.e(TAG, report)
            val opened = runCatching {
                app.startActivity(
                    Intent(app, CrashActivity::class.java)
                        .putExtra(CrashActivity.EXTRA_REPORT, report)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION),
                )
            }.isSuccess
            if (!opened && previous != null) {
                previous.uncaughtException(thread, throwable)
            } else {
                Process.killProcess(Process.myPid())
                exitProcess(10)
            }
        }
    }

    /** The screen's process is `<package>:crash`; the handler must never be installed there (no loops). */
    fun isCrashProcess(processName: String?): Boolean = processName?.endsWith(PROCESS_SUFFIX) == true

    private fun currentProcessName(context: Context): String? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) Application.getProcessName()
        else runCatching { File("/proc/self/cmdline").readText().trim('\u0000', ' ', '\n') }.getOrNull() ?: context.packageName

    /** Header (build, device, time, thread) then the full trace with causes, capped at [MAX_CHARS]. */
    fun format(context: Context?, thread: Thread, throwable: Throwable, now: Instant = Instant.now()): String {
        val version = context?.let { c ->
            runCatching { c.packageManager.getPackageInfo(c.packageName, 0) }.getOrNull()?.let { "${it.versionName} (${it.longVersionCode})" }
        } ?: "unknown"
        val trace = StringWriter().also { throwable.printStackTrace(PrintWriter(it)) }.toString()
        val text = buildString {
            append("Hesabu ").append(version).append('\n')
            append("Android ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append("), ")
            append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n')
            append("At ").append(now).append(" on thread ").append(thread.name).append('\n')
            append('\n')
            append(trace)
        }
        return if (text.length <= MAX_CHARS) text else text.substring(0, MAX_CHARS) + "\n… (truncated)"
    }
}
