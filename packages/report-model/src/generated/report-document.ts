// GENERATED FILE. Do not edit by hand: run `pnpm --filter @hesabu/report-model gen`.
// Source: contracts/report-document.schema.json (frozen contract, orchestrator-owned).

/**
 * This interface was referenced by `ReportDocument`'s JSON-Schema
 * via the `definition` "Section".
 */
export type Section =
  | {
      type: 'hero';
      total_out: string;
      delta: string;
      delta_direction: 'up' | 'down' | 'flat' | 'na';
      verdict: string;
      /**
       * rows of the opening tally (days for weekly, top categories for monthly)
       */
      tally: {
        label: string;
        value: string;
        cents: number;
      }[];
    }
  | {
      type: 'kpis';
      /**
       * @maxItems 4
       */
      items: {
        label: string;
        value: string;
        delta?: string | null;
        tone: 'in' | 'out' | 'fee' | 'transfer' | 'neutral';
      }[];
    }
  | {
      type: 'chart';
      chart_id: string;
      chart_type: ChartType;
      /**
       * states the takeaway
       */
      title: string;
      takeaway?: string | null;
      /**
       * JSON pointer into the FactsSheet, e.g. /daily or /categories
       */
      data_ref: string;
      alt_text: string;
    }
  | {
      type: 'insights';
      title?: string | null;
      /**
       * @maxItems 12
       */
      items: {
        insight_id: string;
        headline: string;
        body: string;
        drilldown?: object | null;
      }[];
    }
  | {
      type: 'table';
      title: string;
      columns: string[];
      rows: string[][];
      numeric_columns: number[];
      total_row?: string[] | null;
    }
  | {
      type: 'list';
      title: string;
      items: string[];
    }
  | {
      type: 'callout';
      tone: 'neutral' | 'fee' | 'warn';
      body: string;
    }
  | {
      type: 'watch';
      title: string;
      /**
       * @minItems 1
       * @maxItems 3
       */
      items: string[];
    }
  | {
      type: 'footer';
      accounts_covered: string[];
      computed_note: string;
      unknown_count: string;
    };
/**
 * This interface was referenced by `ReportDocument`'s JSON-Schema
 * via the `definition` "ChartType".
 */
export type ChartType =
  | 'donut'
  | 'daily_bars'
  | 'stacked_in_out'
  | 'trend_lines'
  | 'top_bars'
  | 'waterfall'
  | 'calendar_heatmap'
  | 'budget_bullets'
  | 'balance_sparkline'
  | 'fee_meter';

/**
 * The one report model rendered four ways (WhatsApp hero + caption + PDF, email, web, app). Produced by the writer step (or the numbers-only fallback) from a FactsSheet. All numbers inside copy must be display strings from the sheet.
 */
export interface ReportDocument {
  version: '1';
  report_id: string;
  kind: 'weekly' | 'monthly';
  locale: 'en' | 'sw';
  period_label: string;
  title: string;
  /**
   * @minItems 3
   */
  sections: Section[];
  whatsapp: {
    /**
     * WhatsApp formatting only: *bold*, _italic_; max 1000 chars
     */
    caption: string;
    /**
     * @maxItems 1
     */
    hero_chart_ids: string[];
  };
  email: {
    subject: string;
    preheader: string;
  };
  meta: {
    generated_at: string;
    facts_version: string;
    writer: 'model' | 'fallback';
    model: string | null;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    fact_check: {
      passed: boolean;
      violations: string[];
      attempts: number;
    };
  };
}
