import type { DeliveryRow, ReportRow } from '@hesabu/db';

export interface ReportSummary {
  report_id: string;
  kind: 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  status: ReportRow['status'];
  writer: ReportRow['writer'];
  artefacts: { hero_png_url: string | null; pdf_url: string | null; web_url: string | null };
  deliveries: {
    channel: DeliveryRow['channel'];
    status: DeliveryRow['status'];
    provider_message_id: string | null;
    last_error: string | null;
    attempts: number;
  }[];
  generated_at: string | null;
}

export function toSummary(report: ReportRow, deliveries: readonly DeliveryRow[]): ReportSummary {
  return {
    report_id: report.id,
    kind: report.kind,
    period_start: report.period_start,
    period_end: report.period_end,
    status: report.status,
    writer: report.writer,
    artefacts: {
      hero_png_url: report.artefacts.hero_png_url ?? null,
      pdf_url: report.artefacts.pdf_url ?? null,
      web_url: report.artefacts.web_url ?? null,
    },
    deliveries: deliveries.map((d) => ({
      channel: d.channel,
      status: d.status,
      provider_message_id: d.provider_message_id,
      last_error: d.last_error,
      attempts: d.attempts,
    })),
    generated_at: report.generated_at,
  };
}
