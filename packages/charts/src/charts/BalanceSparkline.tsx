import type { ReactElement } from 'react';

import { formatKsh, type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { HRule, Label, LINE, Marker, polyline, Tip } from '../primitives.js';
import { linear, px } from '../scale.js';
import { v, VAR } from '../theme.js';
import { textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface BalancePoint {
  readonly at: string;
  readonly cents: number;
  readonly label: string;
}

export interface BalanceSparklineData {
  readonly account: string;
  readonly points: readonly BalancePoint[];
}

export interface BalanceSparklineProps extends BaseChartProps {
  readonly data: BalanceSparklineData;
}

export function balanceSparklineAltText(data: BalanceSparklineData, locale: Locale): string {
  const l = chartLabels(locale);
  const first = data.points[0];
  const last = data.points[data.points.length - 1];
  const min = data.points.reduce((m, p) => (p.cents < m.cents ? p : m), data.points[0]!);
  if (!first || !last) return '';
  return `${data.account} ${l.balance.toLowerCase()}: ${first.label} ${formatKsh(first.cents)}, ${locale === 'sw' ? 'chini zaidi' : 'lowest'} ${min.label} ${formatKsh(min.cents)}, ${last.label} ${formatKsh(last.cents)}.`;
}

export function balanceSparklineTable(data: BalanceSparklineData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return { columns: [l.date, l.balance], rows: data.points.map((p) => [p.label, formatKsh(p.cents)]), numeric: [1] };
}

export function BalanceSparkline({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: BalanceSparklineProps): ReactElement {
  const pts = data.points;
  const n = pts.length;
  const last = pts[n - 1];
  const values = pts.map((p) => p.cents / 100);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const top = 14;
  const plotH = 72;
  const bottom = 20;
  const height = top + plotH + bottom;
  const endLabel = last ? formatKsh(last.cents) : '';
  const endW = textWidth(endLabel, FONT.sm) + 20;
  const plotX = 0;
  const plotW = width - endW;
  const x = linear([0, Math.max(1, n - 1)], [plotX, plotX + plotW]);
  const y = linear([lo, hi === lo ? lo + 1 : hi], [top + plotH, top]);
  const alt = altText ?? balanceSparklineAltText(data, locale);
  const line = pts.map((p, i) => [x(i), y(p.cents / 100)] as const);
  const area = `${polyline([[x(0), y(0)], ...line, [x(n - 1), y(0)]])}`;

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={balanceSparklineTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="balance_sparkline">
        <polygon points={area} fill={v(VAR.ink)} opacity={0.08} />
        <HRule x1={plotX} x2={plotX + plotW} y={y(0)} strong={lo < 0} />
        <polyline points={polyline(line)} fill="none" stroke={v(VAR.ink)} strokeWidth={LINE} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <rect x={px(Math.max(plotX, x(i) - plotW / n / 2))} y={px(top)} width={px(plotW / n)} height={px(plotH)} fill="transparent">
              <Tip>{`${p.label}: ${formatKsh(p.cents)}`}</Tip>
            </rect>
          </g>
        ))}
        {last ? (
          <g>
            <Marker cx={x(n - 1)} cy={y(last.cents / 100)} fill={v(VAR.ink)} />
            <Label x={x(n - 1) + 10} y={y(last.cents / 100) + 5} size={FONT.sm} weight={700} numeric>
              {endLabel}
            </Label>
          </g>
        ) : null}
        <Label x={plotX} y={height - 4} size={FONT.xs} soft>
          {pts[0]?.label ?? ''}
        </Label>
        <Label x={plotX + plotW} y={height - 4} size={FONT.xs} anchor="end" soft>
          {last?.label ?? ''}
        </Label>
      </Svg>
    </Figure>
  );
}
