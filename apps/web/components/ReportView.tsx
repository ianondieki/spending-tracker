import type { ReactElement } from 'react';

import { ReportPage, reportStrings, type Theme } from '@hesabu/charts';
import type { FactsSheet, ReportDocument } from '@hesabu/report-model';

export interface ReportViewProps {
  readonly document: ReportDocument;
  readonly facts: FactsSheet;
  /** Forced theme (dev route); otherwise the system preference applies. */
  readonly theme?: Theme | null;
  readonly reportUrl?: string | null;
}

/** The page shell around the report: paper surface, skip link, optional forced theme. */
export function ReportView({ document, facts, theme = null, reportUrl = null }: ReportViewProps): ReactElement {
  const s = reportStrings(document.locale);
  return (
    <div className="h-page h-page--report" data-theme={theme ?? undefined}>
      <a className="h-skip" href="#report">
        {s.skipToContent}
      </a>
      <main id="report">
        <ReportPage document={document} facts={facts} mode="web" reportUrl={reportUrl} />
      </main>
    </div>
  );
}
