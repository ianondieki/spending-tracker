package ke.hesabu.app

import android.app.Application

/**
 * Application entry point. Keeps process-wide singletons that are cheap to create and
 * must exist before any screen, receiver or worker runs.
 *
 * Note: SQLCipher's native library is loaded lazily by [ke.hesabu.app.data.HesabuDatabase.open],
 * not here, so the Application class can also run under Robolectric (no native libs on the JVM).
 */
class HesabuApplication : Application()
