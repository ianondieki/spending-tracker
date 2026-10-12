package ke.hesabu.app

import android.app.Application

/**
 * Application entry point. Holds the lazily built [AppGraph]; nothing heavy runs at startup.
 *
 * Note: SQLCipher's native library is loaded lazily by [ke.hesabu.app.data.HesabuDatabase.open],
 * not here, so the Application class can also run under Robolectric (no native libs on the JVM).
 */
open class HesabuApplication : Application() {

    open val graph: AppGraph by lazy { AppGraph(this) }

    companion object {
        fun graph(context: android.content.Context): AppGraph = (context.applicationContext as HesabuApplication).graph
    }
}
