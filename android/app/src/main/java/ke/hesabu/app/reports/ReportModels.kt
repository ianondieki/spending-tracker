package ke.hesabu.app.reports

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * contracts/report-document.schema.json and the ReportSummary from openapi.yaml. The app renders ReportDocument
 * sections natively; chart data is looked up in the FactsSheet (kept as JSON) by each section's data_ref pointer.
 */

@Serializable
data class ReportArtefacts(
    @SerialName("hero_png_url") val heroPngUrl: String? = null,
    @SerialName("pdf_url") val pdfUrl: String? = null,
    @SerialName("web_url") val webUrl: String? = null,
)

@Serializable
data class ReportDelivery(
    val channel: String,
    val status: String,
    @SerialName("provider_message_id") val providerMessageId: String? = null,
    @SerialName("last_error") val lastError: String? = null,
    val attempts: Int = 0,
)

@Serializable
data class ReportSummary(
    @SerialName("report_id") val reportId: String,
    val kind: String,
    @SerialName("period_start") val periodStart: String,
    @SerialName("period_end") val periodEnd: String,
    val status: String,
    val writer: String = "pending",
    val artefacts: ReportArtefacts = ReportArtefacts(),
    val deliveries: List<ReportDelivery> = emptyList(),
    @SerialName("generated_at") val generatedAt: String? = null,
)

@Serializable
data class ReportDetail(
    val summary: ReportSummary,
    val document: ReportDocument? = null,
    val facts: JsonObject? = null,
)

@Serializable
data class TallyItem(val label: String, val value: String, val cents: Long)

@Serializable
data class KpiItem(val label: String, val value: String, val delta: String? = null, val tone: String = "neutral")

@Serializable
data class InsightItem(
    @SerialName("insight_id") val insightId: String,
    val headline: String,
    val body: String,
    val drilldown: JsonElement? = null,
)

@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface Section {
    @Serializable @SerialName("hero")
    data class Hero(
        @SerialName("total_out") val totalOut: String,
        val delta: String,
        @SerialName("delta_direction") val deltaDirection: String,
        val verdict: String,
        val tally: List<TallyItem>,
    ) : Section

    @Serializable @SerialName("kpis")
    data class Kpis(val items: List<KpiItem>) : Section

    @Serializable @SerialName("chart")
    data class Chart(
        @SerialName("chart_id") val chartId: String,
        @SerialName("chart_type") val chartType: String,
        val title: String,
        val takeaway: String? = null,
        @SerialName("data_ref") val dataRef: String,
        @SerialName("alt_text") val altText: String,
    ) : Section

    @Serializable @SerialName("insights")
    data class Insights(val title: String? = null, val items: List<InsightItem>) : Section

    @Serializable @SerialName("table")
    data class Table(
        val title: String,
        val columns: List<String>,
        val rows: List<List<String>>,
        @SerialName("numeric_columns") val numericColumns: List<Int>,
        @SerialName("total_row") val totalRow: List<String>? = null,
    ) : Section

    @Serializable @SerialName("list")
    data class ListSection(val title: String, val items: List<String>) : Section

    @Serializable @SerialName("callout")
    data class Callout(val tone: String, val body: String) : Section

    @Serializable @SerialName("watch")
    data class Watch(val title: String, val items: List<String>) : Section

    @Serializable @SerialName("footer")
    data class Footer(
        @SerialName("accounts_covered") val accountsCovered: List<String>,
        @SerialName("computed_note") val computedNote: String,
        @SerialName("unknown_count") val unknownCount: String,
    ) : Section
}

@Serializable
data class WhatsappBlock(val caption: String, @SerialName("hero_chart_ids") val heroChartIds: List<String> = emptyList())

@Serializable
data class EmailBlock(val subject: String, val preheader: String)

@Serializable
data class FactCheck(val passed: Boolean, val violations: List<String> = emptyList(), val attempts: Int = 0)

@Serializable
data class ReportMeta(
    @SerialName("generated_at") val generatedAt: String,
    @SerialName("facts_version") val factsVersion: String = "",
    val writer: String,
    val model: String? = null,
    @SerialName("input_tokens") val inputTokens: Int = 0,
    @SerialName("output_tokens") val outputTokens: Int = 0,
    @SerialName("cost_usd") val costUsd: Double = 0.0,
    @SerialName("fact_check") val factCheck: FactCheck = FactCheck(true),
)

@Serializable
data class ReportDocument(
    val version: String = "1",
    @SerialName("report_id") val reportId: String,
    val kind: String,
    val locale: String = "en",
    @SerialName("period_label") val periodLabel: String,
    val title: String,
    val sections: List<Section>,
    val whatsapp: WhatsappBlock? = null,
    val email: EmailBlock? = null,
    val meta: ReportMeta? = null,
)

val ReportJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    classDiscriminator = "type"
}
