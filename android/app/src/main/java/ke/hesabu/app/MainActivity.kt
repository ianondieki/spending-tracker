package ke.hesabu.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import ke.hesabu.app.ui.HesabuRoot
import ke.hesabu.app.ui.theme.HesabuTheme

/** Single-activity host; all screens are Compose destinations in [HesabuApp]. */
class MainActivity : ComponentActivity() {

    companion object {
        /** Route to open on launch, e.g. from the share receiver. */
        const val EXTRA_OPEN = "ke.hesabu.app.OPEN"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HesabuTheme {
                HesabuRoot(startRoute = intent?.getStringExtra(EXTRA_OPEN))
            }
        }
    }
}
