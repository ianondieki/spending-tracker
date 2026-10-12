package ke.hesabu.app.ui.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.ReportDocument
import ke.hesabu.app.reports.ReportJson
import ke.hesabu.app.reports.ReportSummary
import ke.hesabu.app.ui.theme.HesabuTheme
import kotlinx.serialization.json.JsonObject
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Renders every regenerated sample report under docs/sprint/samples (Lane B's writer output over Lane C's charts)
 * through the native report screen, in the sample's own theme, and records a screenshot. A sample that fails to
 * deserialise or to render fails the build, so a writer or schema drift is caught on the app side too.
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SprintSamplesRenderTest(private val dir: File, @Suppress("unused") private val name: String) {

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{1}")
        fun samples(): List<Array<Any>> {
            val repo = System.getProperty("hesabu.repoDir")?.let(::File) ?: return emptyList()
            val root = repo.resolve("docs/sprint/samples")
            return (root.listFiles { f -> f.isDirectory && f.resolve("document.json").isFile }?.sortedBy { it.name } ?: emptyList())
                .map { arrayOf<Any>(it, it.name) }
        }
    }

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun sampleRendersNatively() {
        assumeTrue(dir.resolve("document.json").isFile)
        val document = ReportJson.decodeFromString(ReportDocument.serializer(), dir.resolve("document.json").readText())
        val facts = dir.resolve("facts.json").takeIf { it.isFile }?.let { ReportJson.parseToJsonElement(it.readText()) as JsonObject }
        val summary = ReportSummary(reportId = document.reportId, kind = document.kind, periodStart = "", periodEnd = "", status = "done", writer = "model")
        val detail = ReportDetail(summary, document, facts)
        val dark = dir.name.endsWith("-dark")
        RuntimeEnvironment.setQualifiers("w360dp-h800dp-" + (if (dark) "night" else "notnight") + "-xhdpi")
        compose.setContent {
            HesabuTheme(darkTheme = dark, reducedMotion = true) {
                ReportScreenContent(state = ReportViewModel.UiState.Ready(detail), share = ReportViewModel.ShareState.Idle, onBack = {}, onRetry = {}, onShare = {})
            }
        }
        compose.waitForIdle()
        val hero = document.sections.filterIsInstance<ke.hesabu.app.reports.Section.Hero>().firstOrNull()
        if (hero != null) compose.onAllNodesWithText(hero.totalOut, substring = true).onFirst().assertIsDisplayed()
        val out = File(System.getProperty("hesabu.screenshotsDir") ?: "screenshots", "sample-${dir.name}.png")
        out.parentFile?.mkdirs()
        compose.onRoot().captureRoboImage(out.absolutePath)
    }
}
