interface ReportPageProps {
  readonly params: Promise<{ readonly token: string }>;
}

/**
 * Signed report link placeholder. Lane C verifies the token with REPORT_LINK_SECRET, loads the
 * ReportDocument and renders the interactive story here. The token is never echoed back.
 */
export default async function ReportPage({ params }: ReportPageProps) {
  const { token } = await params;
  const looksSigned = token.length > 0;
  return (
    <main>
      <h1>Hesabu report</h1>
      {/* [[COPY-REVIEW]] */}
      <p>
        {looksSigned
          ? 'This report link is not wired up yet. Check back once the renderer lands.'
          : 'This link is missing its token.'}
      </p>
    </main>
  );
}
