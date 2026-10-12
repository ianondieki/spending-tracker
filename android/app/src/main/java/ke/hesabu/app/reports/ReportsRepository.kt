package ke.hesabu.app.reports

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.serialization.Serializable

/** A report the server has rendered for this user; the archive lists these. */
@Serializable
data class ReportSummary(
    val id: String,
    /** "weekly" or "monthly". */
    val period: String,
    /** ISO-8601 dates in Africa/Nairobi, e.g. "2026-10-05". */
    val periodStart: String,
    val periodEnd: String,
    /** Signed web-viewer link; expires. */
    val viewUrl: String? = null,
)

interface ReportsRepository {
    fun observeArchive(): Flow<List<ReportSummary>>
}

/** STUB until the reports API is wired: an empty archive. */
class InMemoryReportsRepository : ReportsRepository {
    override fun observeArchive(): Flow<List<ReportSummary>> = flowOf(emptyList())
}
