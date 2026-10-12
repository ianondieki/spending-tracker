package ke.hesabu.app.ingest

import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Robolectric: the receiver is registered in the merged manifest for SMS_RECEIVED. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SmsReceiverManifestTest {

    @Test
    fun receiverIsRegisteredForSmsReceived() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val intent = Intent(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).setPackage(context.packageName)

        val receivers = context.packageManager.queryBroadcastReceivers(intent, 0)

        assertEquals(1, receivers.size)
        assertEquals(SmsReceiver::class.java.name, receivers.single().activityInfo.name)
    }

    @Test
    fun ignoresBroadcastsWithOtherActions() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        // Must not throw: the receiver returns early for unrelated actions.
        SmsReceiver().onReceive(context, Intent(Intent.ACTION_BOOT_COMPLETED))
    }
}
