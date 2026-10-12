/**
 * The report as a ruled ledger: masthead, the opening tally with its double rule, then the sections of the
 * ReportDocument in order. One component renders the web page, the PDF (print stylesheet) and the standalone HTML
 * the renderer produces; `mode` only changes how charts are sized and whether interactive chrome appears.
 */
import type { ReactElement, ReactNode } from 'react';

import type {
  CalloutSection,
  ChartSection,
  FactsSheet,
  FooterSection,
  HeroSection,
  InsightsSection,
  KpisSection,
  ListSection,
  ReportDocument,
  Section,
  TableSection,
  WatchSection,
} from '@hesabu/report-model';

import { DEFAULT_WIDTH, PHONE_WIDTH } from '../common.js';
import { resolveChart } from '../resolve.js';
import type { Theme } from '../tokens.js';
import { reportStrings } from './strings.js';

export type ReportMode = 'web' | 'print' | 'static';

export interface ReportPageProps {
  readonly document: ReportDocument;
  readonly facts: FactsSheet;
  /** Set only for self-contained markup (renderer); the web viewer sets variables on :root instead. */
  readonly theme?: Theme;
  readonly mode?: ReportMode;
  /** Deep link to the app or the signed web report, shown in the footer when present. */
  readonly reportUrl?: string | null;
}

export function ReportPage({
  document: doc,
  facts,
  theme,
  mode = 'web',
  reportUrl = null,
}: ReportPageProps): ReactElement {
  const s = reportStrings(doc.locale);
  const hero = doc.sections.find((x): x is HeroSection => x.type === 'hero');
  const rest = doc.sections.filter((x) => x.type !== 'hero');
  return (
    <article
      className={`h-report h-report--${doc.kind} h-report--${mode}`}
      lang={doc.locale}
      data-report-id={doc.report_id}
    >
      <header className="h-masthead">
        <span className="h-masthead__brand">{s.brand}</span>
        <span className="h-masthead__kind">{doc.kind === 'weekly' ? s.weekly : s.monthly}</span>
        <span className="h-masthead__period">{doc.period_label}</span>
      </header>
      <h1 className="h-report__title">{doc.title}</h1>
      {hero ? <Hero section={hero} doc={doc} /> : null}
      <div className="h-sections">
        {rest.map((section, i) => (
          <SectionView
            key={i}
            section={section}
            facts={facts}
            doc={doc}
            theme={theme}
            mode={mode}
            index={i}
            reportUrl={reportUrl}
          />
        ))}
      </div>
    </article>
  );
}

function Hero({
  section,
  doc,
}: {
  readonly section: HeroSection;
  readonly doc: ReportDocument;
}): ReactElement {
  const s = reportStrings(doc.locale);
  const arrow =
    section.delta_direction === 'up' ? '↑' : section.delta_direction === 'down' ? '↓' : '';
  return (
    <section className="h-hero" aria-labelledby="h-hero-total">
      <table className="h-tally" style={{ ['--rows' as string]: section.tally.length }}>
        <caption className="h-visually-hidden">{s.totalSpent}</caption>
        <tbody>
          {section.tally.map((row, i) => (
            <tr key={i} className="h-tally__row" style={{ ['--i' as string]: i }}>
              <th scope="row" className="h-tally__label">
                {row.label}
              </th>
              <td className="h-tally__value h-num">{row.value}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-tally__total" style={{ ['--i' as string]: section.tally.length }}>
            <th scope="row" className="h-tally__label h-tally__label--total">
              {s.totalSpent}
            </th>
            <td className="h-tally__value h-tally__value--total h-num" id="h-hero-total">
              {section.total_out}
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="h-tally__rule" aria-hidden="true" />
      <p className="h-hero__delta" data-direction={section.delta_direction}>
        <span className="h-hero__delta-value h-num">
          {arrow ? <span aria-hidden="true">{arrow} </span> : null}
          {section.delta}
        </span>{' '}
        <span className="h-hero__delta-label">{s.vsLast(doc.kind)}</span>
      </p>
      <p className="h-hero__verdict">{section.verdict}</p>
    </section>
  );
}

interface SectionViewProps {
  readonly section: Section;
  readonly facts: FactsSheet;
  readonly doc: ReportDocument;
  readonly theme?: Theme;
  readonly mode: ReportMode;
  readonly index: number;
  readonly reportUrl: string | null;
}

function SectionView(props: SectionViewProps): ReactElement | null {
  const { section } = props;
  switch (section.type) {
    case 'kpis':
      return <Kpis section={section} />;
    case 'chart':
      return (
        <ChartBlock
          section={section}
          facts={props.facts}
          doc={props.doc}
          theme={props.theme}
          mode={props.mode}
        />
      );
    case 'insights':
      return <Insights section={section} />;
    case 'table':
      return <TableBlock section={section} />;
    case 'list':
      return <ListBlock section={section} />;
    case 'callout':
      return <Callout section={section} />;
    case 'watch':
      return <Watch section={section} />;
    case 'footer':
      return <Footer section={section} doc={props.doc} reportUrl={props.reportUrl} />;
    case 'hero':
      return null;
  }
}

function Block({
  title,
  kind,
  children,
  id,
}: {
  readonly title?: string | null;
  readonly kind: string;
  readonly children: ReactNode;
  readonly id?: string;
}): ReactElement {
  return (
    <section className={`h-section h-section--${kind}`} id={id} aria-label={title ?? undefined}>
      {title ? <h2 className="h-section__title">{title}</h2> : null}
      {children}
    </section>
  );
}

function Kpis({ section }: { readonly section: KpisSection }): ReactElement {
  return (
    <Block kind="kpis">
      <dl className="h-kpis">
        {section.items.map((k, i) => (
          <div key={i} className="h-kpi" data-tone={k.tone}>
            <dt className="h-kpi__label">{k.label}</dt>
            <dd className="h-kpi__value">
              <span className="h-kpi__amount">{k.value}</span>
              {k.delta ? <span className="h-kpi__delta h-num">{k.delta}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

function ChartBlock({
  section,
  facts,
  doc,
  theme,
  mode,
}: {
  readonly section: ChartSection;
  readonly facts: FactsSheet;
  readonly doc: ReportDocument;
  readonly theme?: Theme;
  readonly mode: ReportMode;
}): ReactElement {
  const common = { locale: doc.locale, theme, showTable: mode === 'web' } as const;
  if (mode !== 'web') {
    return (
      <Block kind="chart" id={`chart-${section.chart_id}`}>
        {resolveChart(section, facts, { ...common, width: DEFAULT_WIDTH })}
      </Block>
    );
  }
  // Two laid-out widths; the stylesheet shows one per viewport. The hidden copy is display:none, so assistive
  // technology sees a single chart.
  return (
    <Block kind="chart" id={`chart-${section.chart_id}`}>
      <div className="h-chart-size h-chart-size--web">
        {resolveChart(section, facts, { ...common, width: DEFAULT_WIDTH })}
      </div>
      <div className="h-chart-size h-chart-size--phone">
        {resolveChart({ ...section, chart_id: `${section.chart_id}-phone` }, facts, {
          ...common,
          width: PHONE_WIDTH,
        })}
      </div>
    </Block>
  );
}

function Insights({ section }: { readonly section: InsightsSection }): ReactElement {
  return (
    <Block kind="insights" title={section.title}>
      <ol className="h-insights">
        {section.items.map((item) => (
          <li key={item.insight_id} className="h-insight" data-insight-id={item.insight_id}>
            <h3 className="h-insight__headline">{item.headline}</h3>
            <p className="h-insight__body">{item.body}</p>
          </li>
        ))}
      </ol>
    </Block>
  );
}

function TableBlock({ section }: { readonly section: TableSection }): ReactElement {
  const numeric = new Set(section.numeric_columns);
  return (
    <Block kind="table" title={section.title}>
      <div className="h-table-scroll" tabIndex={0} role="group" aria-label={section.title}>
        <table className="h-ledger">
          <caption className="h-visually-hidden">{section.title}</caption>
          <thead>
            <tr>
              {section.columns.map((c, i) => (
                <th key={i} scope="col" className={numeric.has(i) ? 'h-num' : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j} className={numeric.has(j) ? 'h-num' : undefined}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
          {section.total_row ? (
            <tfoot>
              <tr className="h-total">
                {section.total_row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j} className={numeric.has(j) ? 'h-num' : undefined}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Block>
  );
}

function ListBlock({ section }: { readonly section: ListSection }): ReactElement {
  return (
    <Block kind="list" title={section.title}>
      <ul className="h-list">
        {section.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Block>
  );
}

function Callout({ section }: { readonly section: CalloutSection }): ReactElement {
  return (
    <aside className={`h-callout h-callout--${section.tone}`} role="note">
      <p>{section.body}</p>
    </aside>
  );
}

function Watch({ section }: { readonly section: WatchSection }): ReactElement {
  return (
    <Block kind="watch" title={section.title}>
      <ol className="h-watch">
        {section.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </Block>
  );
}

function Footer({
  section,
  doc,
  reportUrl,
}: {
  readonly section: FooterSection;
  readonly doc: ReportDocument;
  readonly reportUrl: string | null;
}): ReactElement {
  const s = reportStrings(doc.locale);
  return (
    <footer className="h-footer">
      <p className="h-footer__note">{section.computed_note}</p>
      <dl className="h-footer__meta">
        <div>
          <dt>{s.accountsCovered}</dt>
          <dd>{section.accounts_covered.join(', ')}</dd>
        </div>
        <div>
          <dt>{s.unknownMessages}</dt>
          <dd className="h-num">{section.unknown_count}</dd>
        </div>
        <div>
          <dt>{s.generated}</dt>
          <dd>{doc.meta.generated_at.slice(0, 10)}</dd>
        </div>
      </dl>
      {doc.meta.writer === 'fallback' ? <p className="h-footer__writer">{s.numbersOnly}</p> : null}
      {reportUrl ? (
        <p className="h-footer__link">
          <a className="h-button" href={reportUrl}>
            {s.openInApp}
          </a>
        </p>
      ) : null}
    </footer>
  );
}
