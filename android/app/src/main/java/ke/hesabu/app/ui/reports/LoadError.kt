package ke.hesabu.app.ui.reports

import ke.hesabu.app.R
import ke.hesabu.app.sync.SyncClient
import kotlinx.coroutines.CancellationException

/**
 * Why a reports request failed, reduced to what the person can act on. Built from the exception class alone:
 * no message text, URL or body is ever kept, shown or logged.
 */
enum class LoadError(val bodyRes: Int) {
    /** No server address (should not reach the UI: the sample is shown instead). */
    NotConfigured(R.string.reports_not_configured),
    /** The server refused the device token. */
    Unauthorised(R.string.reports_error_unauthorised),
    /** The server answered with an error. */
    Server(R.string.reports_error_server),
    /** The report id is unknown to the server. */
    NotFound(R.string.report_error_not_found),
    /** No connection, a timeout, or anything else on the way. */
    Network(R.string.reports_error_network),
    ;

    companion object {
        fun from(e: Throwable): LoadError {
            if (e is CancellationException) throw e
            return when (e) {
                is SyncClient.NotConfigured -> NotConfigured
                is SyncClient.Unauthorised -> Unauthorised
                is SyncClient.ServerError -> if (e.status == 404) NotFound else Server
                else -> Network
            }
        }
    }
}
