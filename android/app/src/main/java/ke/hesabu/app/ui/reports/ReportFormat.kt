package ke.hesabu.app.ui.reports

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ke.hesabu.app.R
import ke.hesabu.app.reports.ReportDelivery
import ke.hesabu.app.reports.ReportSummary
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Words and dates for report summaries: the period label (`5 to 11 October 2026`, `October 2026`), the short
 * generated date, and the status and delivery line. Dates are shown in Africa/Nairobi, the Kenyan default.
 */
object ReportFormat {

    val NAIROBI: ZoneId = ZoneId.of("Africa/Nairobi")

    /**
     * The period as people say it. A period end at local midnight is exclusive (the next period's start), so the
     * label ends the day before. [range] joins the two ends in the user's language (`%1$s to %2$s`).
     */
    fun periodLabel(
        kind: String,
        start: String,
        end: String,
        locale: Locale,
        compact: Boolean = false,
        range: (String, String) -> String,
    ): String? {
        val from = localDate(start, exclusive = false) ?: return null
        val to = localDate(end, exclusive = true)?.takeIf { !it.isBefore(from) } ?: from
        if (kind == "monthly") return from.format(DateTimeFormatter.ofPattern("MMMM yyyy", locale))
        // In a one-line list row, a week that crosses a month abbreviates both months so it fits at 360 dp.
        val month = if (compact && from.month != to.month) "MMM" else "MMMM"
        val full = DateTimeFormatter.ofPattern("d $month yyyy", locale)
        if (from == to) return from.format(full)
        val left = when {
            from.year != to.year -> from.format(full)
            from.month != to.month -> from.format(DateTimeFormatter.ofPattern("d $month", locale))
            else -> from.dayOfMonth.toString()
        }
        return range(left, to.format(full))
    }

    /** `12 Oct`, the day the report was made, in Nairobi time; null when it has not been made. */
    fun shortDate(iso: String?, locale: Locale): String? {
        val date = iso?.let { localDate(it, exclusive = false) } ?: return null
        return date.format(DateTimeFormatter.ofPattern("d MMM", locale))
    }

    private fun localDate(iso: String, exclusive: Boolean): LocalDate? {
        val text = iso.trim()
        runCatching { OffsetDateTime.parse(text) }.getOrNull()?.let { odt ->
            val local = odt.atZoneSameInstant(NAIROBI)
            val date = local.toLocalDate()
            return if (exclusive && local.toLocalTime() == LocalTime.MIDNIGHT) date.minusDays(1) else date
        }
        return runCatching { LocalDate.parse(text.take(10)) }.getOrNull()
    }
}

/** The period label for a summary, falling back to the raw dates if they do not parse. */
@Composable
fun periodLabel(summary: ReportSummary, locale: Locale, compact: Boolean = false): String {
    val rangeTemplate = stringResource(R.string.reports_period_range)
    return ReportFormat.periodLabel(summary.kind, summary.periodStart, summary.periodEnd, locale, compact) { a, b ->
        String.format(locale, rangeTemplate, a, b)
    } ?: summary.periodStart.take(10)
}

/** One status word for the pipeline step the report is at. */
@Composable
fun statusText(status: String): String = stringResource(
    when (status) {
        "queued" -> R.string.reports_status_queued
        "collecting" -> R.string.reports_status_collecting
        "writing" -> R.string.reports_status_writing
        "checking" -> R.string.reports_status_checking
        "rendering" -> R.string.reports_status_rendering
        "delivering" -> R.string.reports_status_delivering
        "done" -> R.string.reports_status_done
        "failed" -> R.string.reports_status_failed
        else -> R.string.reports_status_working
    },
)

/** `Ready, WhatsApp read, email delivered`: the status, then each delivery channel and its state. */
@Composable
fun statusLine(summary: ReportSummary): String =
    (listOf(statusText(summary.status)) + summary.deliveries.map { deliveryText(it) }).joinToString(", ")

@Composable
private fun deliveryText(d: ReportDelivery): String {
    if (d.channel == "share" && d.status != "failed") return stringResource(R.string.reports_delivery_shared)
    val channel = stringResource(
        when (d.channel) {
            "whatsapp" -> R.string.reports_channel_whatsapp
            "email" -> R.string.reports_channel_email
            else -> R.string.reports_channel_share
        },
    )
    // The server skips delivery until the address is verified; say what to do rather than just "skipped".
    if (d.status == "skipped" && d.lastError?.contains("unverified", ignoreCase = true) == true) {
        return stringResource(R.string.reports_delivery_unverified, channel)
    }
    return stringResource(
        when (d.status) {
            "sent" -> R.string.reports_delivery_sent
            "delivered" -> R.string.reports_delivery_delivered
            "read" -> R.string.reports_delivery_read
            "failed" -> R.string.reports_delivery_failed
            "skipped" -> R.string.reports_delivery_skipped
            else -> R.string.reports_delivery_pending
        },
        channel,
    )
}
