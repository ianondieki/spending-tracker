import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fixtures } from '@hesabu/report-model';

import { ReportView } from '../components/ReportView';

describe('ReportView', () => {
  it('renders the report inside the paper shell with a skip link', () => {
    const { document, facts } = fixtures['monthly-sw'];
    const html = renderToStaticMarkup(<ReportView document={document} facts={facts} theme="dark" />);
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('href="#report"');
    expect(html).toContain('Ruka hadi ripoti');
    expect(html).toContain('lang="sw"');
    expect(html).toContain('data-chart="trend_lines"');
  });
  it('leaves the theme to the system when none is forced', () => {
    const { document, facts } = fixtures['weekly-en'];
    const html = renderToStaticMarkup(<ReportView document={document} facts={facts} />);
    expect(html).not.toContain('data-theme=');
  });
});
