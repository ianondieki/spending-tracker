import type { ReactElement } from 'react';

import { compactKsh, type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { HRule, Label, LINE, Marker, polyline, Tip } from '../primitives.js';
import { linear, niceMax, px, ticks } from '../scale.js';
import { v, VAR } from '../theme.js';
import { textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface TrendPoint {
  readonly label: string;
  readonly in: { readonly cents: number; readonly display: string };
  readonly out: { readonly cents: number; readonly display: string };
  readonly net: { readonly cents: number; readonly display: string };
  readonly isCurrent: boolean;
}

export interface TrendLinesData {
  readonly points: readonly TrendPoint[];
}

export interface TrendLinesProps extends BaseChartProps {
  readonly data: TrendLinesData;
}

export function trendLinesAltText(data: TrendLinesData, locale: Locale): string {
  const l = chartLabels(locale);
  const first = data.points[0];
  const last = data.points[data.points.length - 1];
  if (!first || !last) return '';
  return `${l.in} ${first.label} ${first.in.display}, ${last.label} ${last.in.display}. ${l.out} ${first.label} ${first.out.display}, ${last.label} ${last.out.display}. ${l.net} ${last.label} ${last.net.display}.`;
}

export function trendLinesTable(data: TrendLinesData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return { columns: [l.month, l.in, l.out, l.net], rows: data.points.map((p) => [p.label, p.in.display, p.out.display, p.net.display]), numeric: [1, 2, 3] };
}

export function TrendLines({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: TrendLinesProps): ReactElement {
  const l = chartLabels(locale);
  const pts = data.points;
  const n = pts.length;
  const allValues = pts.flatMap((p) => [p.in.cents, p.out.cents, p.net.cents]).map((c) => c / 100);
  const max = niceMax(Math.max(...allValues));
  const min = Math.min(0, ...allValues);
  const yTicks = ticks(min, max, 4);
  const left = Math.ceil(textWidth(compactKsh(max), FONT.xs)) + 10;
  const endLabelW = Math.max(...pts.slice(-1).flatMap((p) => [`${l.in} ${p.in.display}`, `${l.out} ${p.out.display}`, `${l.net} ${p.net.display}`]).map((s) => textWidth(s, FONT.xs))) + 16;
  const top = 16;
  const plotH = 200;
  const bottom = 26;
  const height = top + plotH + bottom;
  const plotX = left;
  const plotW = width - left - endLabelW - 16;
  const x = linear([0, Math.max(1, n - 1)], [plotX, plotX + plotW]);
  const y = linear([yTicks[0] ?? 0, yTicks[yTicks.length - 1] ?? max], [top + plotH, top]);
  const current = pts.findIndex((p) => p.isCurrent);
  const band = n > 1 ? plotW / (n - 1) : plotW;
  const series = [
    { key: 'in', color: v(VAR.in), name: l.in, get: (p: TrendPoint) => p.in },
    { key: 'out', color: v(VAR.out), name: l.out, get: (p: TrendPoint) => p.out },
    { key: 'net', color: v(VAR.transfer), name: l.net, get: (p: TrendPoint) => p.net },
  ] as const;
  const alt = altText ?? trendLinesAltText(data, locale);
  // Keep the three end labels from overlapping: sort by y and push apart by 14 px.
  const last = pts[n - 1]!;
  const ends = series.map((s) => ({ s, y: y(s.get(last).cents / 100), text: `${s.name} ${s.get(last).display}` }));
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i]!.y - ends[i - 1]!.y < 14) ends[i]!.y = ends[i - 1]!.y + 14;
  }

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={trendLinesTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="trend_lines">
        {current >= 0 ? <rect x={px(Math.max(plotX, x(current) - band / 2))} y={px(top)} width={px(Math.min(x(current) + band / 2, plotX + plotW) - Math.max(plotX, x(current) - band / 2))} height={px(plotH)} fill={v(VAR.ink)} opacity={0.06} /> : null}
        {yTicks.map((t) => (
          <g key={t}>
            <HRule x1={plotX} x2={plotX + plotW} y={y(t)} strong={t === 0} />
            <Label x={plotX - 6} y={y(t) + 4} size={FONT.xs} anchor="end" soft numeric>
              {compactKsh(t)}
            </Label>
          </g>
        ))}
        {series.map((s) => (
          <polyline key={s.key} points={polyline(pts.map((p, i) => [x(i), y(s.get(p).cents / 100)]))} fill="none" stroke={s.color} strokeWidth={LINE} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((s) =>
          pts.map((p, i) => (
            <Marker key={`${s.key}-${i}`} cx={x(i)} cy={y(s.get(p).cents / 100)} fill={s.color}>
              <Tip>{`${p.label} ${s.name.toLowerCase()}: ${s.get(p).display}`}</Tip>
            </Marker>
          )),
        )}
        {ends.map((e) => (
          <g key={e.s.key}>
            <line x1={px(plotX + plotW + 4)} x2={px(plotX + plotW + 12)} y1={px(e.y)} y2={px(e.y)} stroke={e.s.color} strokeWidth={LINE} strokeLinecap="round" />
            <Label x={plotX + plotW + 16} y={e.y + 4} size={FONT.xs} anchor="start" numeric>
              {e.text}
            </Label>
          </g>
        ))}
        {pts.map((p, i) => (
          <Label key={i} x={x(i)} y={top + plotH + 18} size={FONT.xs} anchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} weight={p.isCurrent ? 700 : 400} soft={!p.isCurrent}>
            {p.label}
          </Label>
        ))}
      </Svg>
    </Figure>
  );
}
