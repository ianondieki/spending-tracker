package ke.hesabu.app.ui.reports

import ke.hesabu.app.reports.ReportDetail
import ke.hesabu.app.reports.ReportJson
import java.io.File

/** Loads the bundled sample report (assets/demo-builtin/sample-report.json) for JVM and Robolectric tests. */
object SampleReport {
    val file: File = File(System.getProperty("user.dir"), "src/main/assets/${ReportsRepository.SAMPLE_ASSET}")

    val text: String by lazy { file.readText() }

    val detail: ReportDetail by lazy { ReportJson.decodeFromString(ReportDetail.serializer(), text) }
}
