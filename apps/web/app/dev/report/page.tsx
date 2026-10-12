import { notFound } from 'next/navigation';

import { FIXTURE_NAMES, getFixture } from '@hesabu/report-model';

import { ReportView } from '../../../components/ReportView';
import { devRoutesEnabled } from '../../../lib/report-api';

interface DevReportProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = 'force-dynamic';

/** `/dev/report?fixture=weekly-en&theme=dark` renders a fixture without an API. Off in production unless HESABU_DEV_ROUTES=1. */
export default async function DevReportPage({ searchParams }: DevReportProps) {
  if (!devRoutesEnabled()) notFound();
  const sp = await searchParams;
  const name = typeof sp.fixture === 'string' ? sp.fixture : 'weekly-en';
  const theme = sp.theme === 'dark' ? 'dark' : sp.theme === 'light' ? 'light' : null;
  const fixture = getFixture(name);
  if (!fixture) {
    return (
      <div className="h-page">
        <main className="h-plain">
          <h1>Unknown fixture</h1>
          <p>Try one of: {FIXTURE_NAMES.join(', ')}.</p>
        </main>
      </div>
    );
  }
  return <ReportView document={fixture.document} facts={fixture.facts} theme={theme} reportUrl="hesabu://report" />;
}
