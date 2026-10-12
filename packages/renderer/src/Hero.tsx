/**
 * The WhatsApp hero image, 1080×1350 (4:5): sheet background, Hesabu and the period at the top, the tally with its
 * total under a double rule, a small donut bottom right, three insight lines and the "Full report" line at the
 * foot. Minimum text 28 px so it reads at 25 % scale. Laid out in absolute pixels; no responsive behaviour.
 */
import type { ReactElement } from 'react';

import { chartLabels, DonutRing, donutData, HERO, humanName, reportStrings, themeStyle, type Theme } from '@hesabu/charts';
import type { FactsSheet, HeroSection, InsightsSection, ReportDocument } from '@hesabu/report-model';

export interface HeroProps {
  readonly document: ReportDocument;
  readonly facts: FactsSheet;
  readonly theme: Theme;
}

export const HERO_CSS = `
.hero { position: relative; width: ${HERO.width}px; height: ${HERO.height}px; box-sizing: border-box; padding: ${HERO.padding_px}px; background: var(--h-sheet); color: var(--h-ink); font-family: var(--h-font); overflow: hidden; }
.hero__top { display: flex; justify-content: space-between; align-items: baseline; }
.hero__brand { font-size: 44px; font-weight: 700; letter-spacing: -0.01em; }
.hero__period { font-size: 30px; color: var(--h-ink-soft); }
.hero__title { margin: 28px 0 0; font-size: 56px; font-weight: 700; line-height: 1.1; letter-spacing: -0.015em; }
.hero__tally { width: 100%; border-collapse: collapse; margin-top: 32px; }
.hero__tally th, .hero__tally td { padding: 11px 0; border-bottom: 2px solid var(--h-rule); font-size: 30px; font-weight: 400; line-height: 1.1; text-align: left; }
.hero__tally th { color: var(--h-ink-soft); }
.hero__tally td { text-align: right; }
.hero__total { display: flex; justify-content: space-between; align-items: baseline; padding: 28px 0 20px; border-bottom: 6px double var(--h-ink); }
.hero__total-label { font-size: 30px; }
.hero__total-value { font-size: 104px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
.hero__delta { margin: 24px 0 0; font-size: 32px; width: 520px; line-height: 1.3; font-weight: 500; }
.hero__insights { margin: 24px 0 0; padding: 0; list-style: none; width: 520px; }
.hero__insights li { font-size: 28px; line-height: 1.3; margin-top: 10px; padding-left: 28px; position: relative; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.hero__insights li::before { content: ""; position: absolute; left: 0; top: 12px; width: 12px; height: 12px; border-radius: 2px; background: var(--h-biro); }
.hero__donut { position: absolute; right: ${HERO.padding_px}px; bottom: 130px; width: 388px; }
.hero__donut svg { display: block; width: 388px; height: auto; }
.hero__foot { position: absolute; left: ${HERO.padding_px}px; right: ${HERO.padding_px}px; bottom: ${HERO.padding_px}px; display: flex; justify-content: space-between; align-items: baseline; font-size: 30px; color: var(--h-biro); font-weight: 500; }
.hero__foot span { color: var(--h-ink-soft); font-weight: 400; }
`;

export function Hero({ document: doc, facts, theme }: HeroProps): ReactElement {
  const s = reportStrings(doc.locale);
  const hero = doc.sections.find((x): x is HeroSection => x.type === 'hero');
  const insights = doc.sections.find((x): x is InsightsSection => x.type === 'insights');
  const rows = hero ? hero.tally.slice(0, 7) : [];
  const lines = insights ? insights.items.slice(0, 3).map((i) => i.headline) : [];
  const cl = chartLabels(doc.locale);
  return (
    <div className="hero" style={themeStyle(theme)} lang={doc.locale}>
      <div className="hero__top">
        <span className="hero__brand">{s.brand}</span>
        <span className="hero__period">{doc.period_label}</span>
      </div>
      <h1 className="hero__title">{doc.title}</h1>
      {hero ? (
        <>
          <table className="hero__tally">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{humanName(r.label)}</th>
                  <td>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hero__total">
            <span className="hero__total-label">{s.totalSpent}</span>
            <span className="hero__total-value">{hero.total_out}</span>
          </div>
          <p className="hero__delta">{s.deltaSentence(hero.delta, hero.delta_direction, doc.kind)}</p>
        </>
      ) : null}
      <ul className="hero__insights">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <div className="hero__donut">
        <DonutRing data={donutData(facts, doc.locale)} size={270} width={388} rows={2} fontSize={28} label={cl.out} otherLabel={cl.other} altText="" />
      </div>
      <div className="hero__foot">
        <span>{doc.kind === 'weekly' ? s.weekly : s.monthly}</span>
        {s.fullReport}
      </div>
    </div>
  );
}
