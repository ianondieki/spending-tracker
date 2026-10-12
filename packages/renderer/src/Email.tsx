/**
 * Table-based email: inline styles only (no variables, no external CSS), light palette, `cid:` images for the hero
 * and every chart, a plain-text twin. Dark-mode safe: `color-scheme: light` and explicit backgrounds on every cell.
 */
import type { ReactElement, ReactNode } from 'react';

import { designTokens, reportStrings } from '@hesabu/charts';
import type { ReportDocument, Section } from '@hesabu/report-model';

export interface EmailProps {
  readonly document: ReportDocument;
  readonly reportUrl: string;
  readonly baseUrl: string;
  /** chart ids that have a cid image available */
  readonly chartIds: readonly string[];
}

const C = designTokens.color.light;
const FONT = `'Schibsted Grotesk', ${designTokens.font.fallback}`;
const WIDTH = 600;
const PAD = 24;

const text = (size: number, weight = 400, color = C.ink): React.CSSProperties => ({ fontFamily: FONT, fontSize: size, lineHeight: 1.45, fontWeight: weight, color, margin: 0 });
const cell = (extra: React.CSSProperties = {}): React.CSSProperties => ({ padding: 0, fontFamily: FONT, color: C.ink, ...extra });

function Row({ children, style }: { readonly children: ReactNode; readonly style?: React.CSSProperties }): ReactElement {
  return (
    <tr>
      <td style={cell(style)}>{children}</td>
    </tr>
  );
}

function Ledger({ columns, rows, numeric, total }: { readonly columns: readonly string[]; readonly rows: ReadonlyArray<ReadonlyArray<string>>; readonly numeric: ReadonlySet<number>; readonly total?: readonly string[] | null }): ReactElement {
  const th = (i: number): React.CSSProperties => ({ ...cell({ padding: '8px 0', borderBottom: `1px solid ${C.rule}`, fontSize: 14, color: C.ink_soft, textAlign: numeric.has(i) ? 'right' : 'left' }) });
  const td = (i: number, bold = false): React.CSSProperties => ({ ...cell({ padding: '8px 0', borderBottom: `1px solid ${C.rule}`, fontSize: 14, textAlign: numeric.has(i) ? 'right' : 'left', fontWeight: bold ? 700 : 400, paddingLeft: i > 0 ? 12 : 0 }) });
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse' }}>
      {columns.some(Boolean) ? (
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={th(i)}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j} style={td(j)}>
                {v}
              </td>
            ))}
          </tr>
        ))}
        {total ? (
          <tr>
            {total.map((v, j) => (
              <td key={j} style={{ ...td(j, true), borderTop: `1px solid ${C.ink}`, borderBottom: `3px double ${C.ink}` }}>
                {v}
              </td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function SectionBlock({ section, doc, chartIds }: { readonly section: Section; readonly doc: ReportDocument; readonly chartIds: ReadonlySet<string> }): ReactElement | null {
  const s = reportStrings(doc.locale);
  const title = (t: string | null | undefined) => (t ? <p style={{ ...text(20, 500), marginBottom: 12 }}>{t}</p> : null);
  switch (section.type) {
    case 'hero':
      return (
        <Row style={{ paddingTop: 8 }}>
          <Ledger columns={[]} rows={section.tally.map((r) => [r.label, r.value])} numeric={new Set([1])} total={[s.totalSpent, section.total_out]} />
          <p style={{ ...text(16), marginTop: 12 }}>
            <b style={{ fontWeight: 500 }}>{section.delta}</b> <span style={{ color: C.ink_soft }}>{s.vsLast(doc.kind)}</span>
          </p>
          <p style={{ ...text(20), marginTop: 12 }}>{section.verdict}</p>
        </Row>
      );
    case 'kpis':
      return (
        <Row style={{ paddingTop: 24 }}>
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                {section.items.map((k, i) => {
                  const color = k.tone === 'in' ? C.in : k.tone === 'fee' ? C.fee : k.tone === 'transfer' ? C.transfer : C.ink;
                  return (
                    <td key={i} valign="top" style={cell({ width: `${100 / section.items.length}%`, padding: '12px 8px 12px 0', borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}` })}>
                      <p style={text(14, 400, C.ink_soft)}>{k.label}</p>
                      <p style={{ ...text(20, 700, color), lineHeight: 1.1, marginTop: 4 }}>{k.value}</p>
                      {k.delta ? <p style={{ ...text(14, 400, C.ink_soft), marginTop: 4 }}>{k.delta}</p> : null}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </Row>
      );
    case 'chart':
      return (
        <Row style={{ paddingTop: 32 }}>
          <p style={text(16, 500)}>{section.title}</p>
          {section.takeaway ? <p style={{ ...text(14, 400, C.ink_soft), marginTop: 4 }}>{section.takeaway}</p> : null}
          {chartIds.has(section.chart_id) ? (
            <img src={`cid:${section.chart_id}`} width={WIDTH - 2 * PAD} alt={section.alt_text} style={{ display: 'block', width: '100%', maxWidth: WIDTH - 2 * PAD, height: 'auto', marginTop: 12, border: 0 }} />
          ) : (
            <p style={{ ...text(14), marginTop: 8 }}>{section.alt_text}</p>
          )}
        </Row>
      );
    case 'insights':
      return (
        <Row style={{ paddingTop: 32 }}>
          {title(section.title)}
          {section.items.map((it) => (
            <div key={it.insight_id} style={{ marginBottom: 16 }}>
              <p style={text(16, 500)}>{it.headline}</p>
              <p style={{ ...text(16), marginTop: 4 }}>{it.body}</p>
            </div>
          ))}
        </Row>
      );
    case 'table':
      return (
        <Row style={{ paddingTop: 32 }}>
          {title(section.title)}
          <Ledger columns={section.columns} rows={section.rows} numeric={new Set(section.numeric_columns)} total={section.total_row} />
        </Row>
      );
    case 'list':
    case 'watch':
      return (
        <Row style={{ paddingTop: 32 }}>
          {title(section.title)}
          <ol style={{ ...text(16), paddingLeft: 24 }}>
            {section.items.map((it, i) => (
              <li key={i} style={{ marginTop: 8 }}>
                {it}
              </li>
            ))}
          </ol>
        </Row>
      );
    case 'callout':
      return (
        <Row style={{ paddingTop: 24 }}>
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
            <tbody>
              <tr>
                <td style={cell({ padding: '12px 16px', backgroundColor: C.paper, borderLeft: `3px solid ${section.tone === 'fee' ? C.fee : section.tone === 'warn' ? C.warn : C.rule}` })}>
                  <p style={text(16)}>{section.body}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </Row>
      );
    case 'footer':
      return (
        <Row style={{ paddingTop: 48, borderTop: `1px solid ${C.rule}` }}>
          <p style={{ ...text(14), marginTop: 16 }}>{section.computed_note}</p>
          <p style={{ ...text(14, 400, C.ink_soft), marginTop: 8 }}>
            {s.accountsCovered}: {section.accounts_covered.join(', ')}
          </p>
          <p style={{ ...text(14, 400, C.ink_soft), marginTop: 4 }}>
            {s.unknownMessages}: {section.unknown_count}
          </p>
        </Row>
      );
  }
}

export function Email({ document: doc, reportUrl, chartIds }: EmailProps): ReactElement {
  const s = reportStrings(doc.locale);
  const ids = new Set(chartIds);
  const hero = doc.sections.find((x) => x.type === 'hero');
  return (
    <html lang={doc.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{doc.email.subject}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: C.paper, colorScheme: 'light' }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', fontSize: 1, lineHeight: 1, color: C.paper }}>{doc.email.preheader}</div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ backgroundColor: C.paper }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '24px 8px' }}>
                <table role="presentation" width={WIDTH} cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', maxWidth: WIDTH, backgroundColor: C.sheet, borderRadius: 8 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: PAD }}>
                        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
                          <tbody>
                            <Row style={{ paddingBottom: 12, borderBottom: `1px solid ${C.rule}` }}>
                              <span style={{ ...text(16, 700), display: 'inline' }}>{s.brand}</span>
                              <span style={{ ...text(14, 400, C.ink_soft), display: 'inline', marginLeft: 12 }}>{doc.kind === 'weekly' ? s.weekly : s.monthly}</span>
                              <span style={{ ...text(14, 400, C.ink_soft), display: 'inline', float: 'right' }}>{doc.period_label}</span>
                            </Row>
                            <Row style={{ paddingTop: 24 }}>
                              <h1 style={{ ...text(28, 700), lineHeight: 1.1 }}>{doc.title}</h1>
                            </Row>
                            {hero ? (
                              <Row style={{ paddingTop: 16 }}>
                                <img src="cid:hero" width={WIDTH - 2 * PAD} alt={hero.type === 'hero' ? `${s.totalSpent} ${hero.total_out}, ${hero.delta} ${s.vsLast(doc.kind)}. ${hero.verdict}` : ''} style={{ display: 'block', width: '100%', maxWidth: WIDTH - 2 * PAD, height: 'auto', border: 0, borderRadius: 8 }} />
                              </Row>
                            ) : null}
                            {doc.sections.map((section, i) => (
                              <SectionBlock key={i} section={section} doc={doc} chartIds={ids} />
                            ))}
                            <Row style={{ paddingTop: 24 }}>
                              <a href={reportUrl} style={{ display: 'inline-block', padding: '14px 24px', backgroundColor: C.biro, color: C.on_biro, fontFamily: FONT, fontSize: 16, fontWeight: 500, textDecoration: 'none', borderRadius: 4 }}>
                                {s.fullReport}
                              </a>
                            </Row>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

/** Plain-text alternative: every section, nothing lost, 72-column friendly. */
export function emailText(doc: ReportDocument, reportUrl: string): string {
  const s = reportStrings(doc.locale);
  const out: string[] = [`${s.brand}, ${doc.kind === 'weekly' ? s.weekly : s.monthly}, ${doc.period_label}`, '', doc.title.toUpperCase(), ''];
  for (const section of doc.sections) {
    switch (section.type) {
      case 'hero':
        for (const r of section.tally) out.push(`${r.label.padEnd(28)}${r.value.padStart(14)}`);
        out.push(`${s.totalSpent.padEnd(28)}${section.total_out.padStart(14)}`, `${section.delta} ${s.vsLast(doc.kind)}`, '', section.verdict, '');
        break;
      case 'kpis':
        for (const k of section.items) out.push(`${k.label}: ${k.value}${k.delta ? ` (${k.delta})` : ''}`);
        out.push('');
        break;
      case 'chart':
        out.push(section.title, section.alt_text, '');
        break;
      case 'insights':
        if (section.title) out.push(section.title.toUpperCase());
        for (const it of section.items) out.push(`- ${it.headline}`, `  ${it.body}`);
        out.push('');
        break;
      case 'table':
        out.push(section.title.toUpperCase());
        for (const r of section.rows) out.push(r.join('  |  '));
        if (section.total_row) out.push(section.total_row.join('  |  '));
        out.push('');
        break;
      case 'list':
      case 'watch':
        out.push(section.title.toUpperCase());
        section.items.forEach((it, i) => out.push(`${i + 1}. ${it}`));
        out.push('');
        break;
      case 'callout':
        out.push(`> ${section.body}`, '');
        break;
      case 'footer':
        out.push(section.computed_note, `${s.accountsCovered}: ${section.accounts_covered.join(', ')}`, `${s.unknownMessages}: ${section.unknown_count}`, '');
        break;
    }
  }
  out.push(`${s.fullReport}: ${reportUrl}`);
  return out.join('\n');
}
