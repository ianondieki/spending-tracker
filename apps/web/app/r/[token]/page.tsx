import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ReportView } from '../../../components/ReportView';
import { loadPublicReport } from '../../../lib/report-api';

interface ReportPageProps {
  readonly params: Promise<{ readonly token: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await loadPublicReport(token);
  if (result.kind !== 'ok') return { title: 'Hesabu' };
  return { title: `${result.report.document.title}, ${result.report.document.period_label}`, robots: { index: false } };
}

/**
 * Signed, expiring report link. The API validates the token and returns the document and facts; this page only
 * renders what validates. Unknown or expired links are a 404; a missing or failing API is an honest error page,
 * never a half-rendered report.
 */
export default async function SignedReportPage({ params }: ReportPageProps) {
  const { token } = await params;
  const result = await loadPublicReport(token);
  if (result.kind === 'not_found') notFound();
  if (result.kind === 'unavailable') {
    return (
      <div className="h-page">
        <main className="h-plain">
          <h1>This report cannot be shown right now</h1>
          {/* [[COPY-REVIEW]] */}
          <p>Hesabu could not load the report behind this link. Try again in a few minutes, or open the report in the app.</p>
        </main>
      </div>
    );
  }
  return <ReportView document={result.report.document} facts={result.report.facts} />;
}
