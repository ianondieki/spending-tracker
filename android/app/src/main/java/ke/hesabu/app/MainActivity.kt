package ke.hesabu.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import ke.hesabu.app.ui.HesabuApp
import ke.hesabu.app.ui.theme.HesabuTheme

/** Single-activity host; all screens are Compose destinations in [HesabuApp]. */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HesabuTheme {
                HesabuApp()
            }
        }
    }
}
