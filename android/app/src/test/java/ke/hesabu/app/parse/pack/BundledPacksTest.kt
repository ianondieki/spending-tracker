package ke.hesabu.app.parse.pack

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The packs the APK actually ships: contracts/provider-packs copied into assets/provider-packs at build time, with
 * the built-in M-Pesa pack yielding because the contract pack claims the same sender. This runs against the merged
 * assets, so a build that stops copying the contracts (as a nested-comment bug in build.gradle.kts once did) fails here.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BundledPacksTest {

    @Test
    fun contractPacksAreBundledAndWinOverTheBuiltinForTheSameSender() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val contract = context.assets.list(PackLoader.CONTRACT_DIR)?.filter { it.endsWith(".json") } ?: emptyList()
        assertTrue("assets/provider-packs is empty: the build did not copy contracts/provider-packs", contract.isNotEmpty())
        val packs = PackLoader.fromAssets(context)
        val ids = packs.map { it.packId }
        assertTrue("contract M-Pesa pack missing from $ids", "mpesa" in ids)
        assertFalse("built-in pack must yield to the contract pack claiming MPESA: $ids", "mpesa_builtin" in ids)
        val engine = PackEngine(packs)
        assertEquals("mpesa", engine.providerFor("MPESA"))
        val r = engine.parse(InboundMessage("MPESA", "QJK3X8Y2M4 Confirmed. Ksh450.00 paid to NAIVAS SUPERMARKET. on 12/10/26 at 1:20 PM.New M-PESA balance is Ksh3,650.00. Transaction cost, Ksh0.00.", 0))
        assertEquals("mpesa", (r as ParseResult.Parsed).transaction.packId)
    }

    @Test
    fun taxonomyAndDemoInboxAreBundledFromTheMonorepo() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        assertTrue((context.assets.list("demo") ?: emptyArray()).contains("demo-inbox.jsonl"))
        // The taxonomy is a build output (pnpm build); CI builds it before Gradle, a fresh checkout may not have it.
        val dist = System.getProperty("hesabu.repoDir")?.let { java.io.File(it, "packages/taxonomy/dist") }
        if (dist?.isDirectory == true) assertTrue((context.assets.list("taxonomy") ?: emptyArray()).any { it.endsWith(".json") })
    }
}
