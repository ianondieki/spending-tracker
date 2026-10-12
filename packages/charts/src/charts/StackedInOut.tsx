import type { ReactElement } from 'react';

import { compactKsh, type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { GAP, HRule, Label, Tip, vBarPath } from '../primitives.js';
import { linear, niceMax, px, ticks } from '../scale.js';
import { v, VAR } from '../theme.js';
import { textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface InOutPeriod {
  readonly label: string;
  readonly in: { readonly cents: number; readonly display: string };
  readonly out: { readonly cents: number; readonly display: string };
  readonly net: { readonly cents: number; readonly display: string };
}

export interface StackedInOutData {
  readonly current: InOutPeriod;
  readonly previous: InOutPeriod;
}

export interface StackedInOutProps extends BaseChartProps {
  readonly data: StackedInOutData;
}

export function stackedInOutAltText(data: StackedInOutData, locale: Locale): string {
  const l = chartLabels(locale);
  const one = (p: InOutPeriod) => `${p.label}: ${l.in.toLowerCase()} ${p.in.display}, ${l.out.toLowerCase()} ${p.out.display}, ${l.net.toLowerCase()} ${p.net.display}`;
  return `${one(data.current)}. ${one(data.previous)}.`;
}

export function stackedInOutTable(data: StackedInOutData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return {
    columns: ['', l.in, l.out, l.net],
    rows: [data.current, data.previous].map((p) => [p.label, p.in.display, p.out.display, p.net.display]),
    numeric: [1, 2, 3],
  };
}

export function StackedInOut({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: StackedInOutProps): ReactElement {
  const l = chartLabels(locale);
  const periods = [data.current, data.previous];
  const max = niceMax(Math.max(...periods.flatMap((p) => [p.in.cents, p.out.cents])) / 100);
  const yTicks = ticks(0, max, 4);
  const left = Math.ceil(textWidth(compactKsh(max), FONT.xs)) + 10;
  const top = 36;
  const plotH = 160;
  const bottom = 26;
  const height = top + plotH + bottom;
  const plotX = left;
  const plotW = width - left - 8;
  const groupW = plotW / 2;
  const barW = 24;
  const y = linear([0, max], [top + plotH, top]);
  const alt = altText ?? stackedInOutAltText(data, locale);

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={stackedInOutTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="stacked_in_out">
        <g aria-hidden="true">
          <rect x={px(plotX)} y={6} width={10} height={10} rx={2} fill={v(VAR.in)} />
          <Label x={plotX + 16} y={15} size={FONT.xs} soft>
            {l.in}
          </Label>
          <rect x={px(plotX + 16 + textWidth(l.in, FONT.xs) + 14)} y={6} width={10} height={10} rx={2} fill={v(VAR.out)} />
          <Label x={plotX + 16 + textWidth(l.in, FONT.xs) + 30} y={15} size={FONT.xs} soft>
            {l.out}
          </Label>
        </g>
        {yTicks.map((t) => (
          <g key={t}>
            <HRule x1={plotX} x2={plotX + plotW} y={y(t)} strong={t === 0} />
            <Label x={plotX - 6} y={y(t) + 4} size={FONT.xs} anchor="end" soft numeric>
              {compactKsh(t)}
            </Label>
          </g>
        ))}
        {periods.map((p, i) => {
          const gx = plotX + i * groupW + groupW / 2;
          const xIn = gx - barW - GAP / 2;
          const xOut = gx + GAP / 2;
          const topY = Math.min(y(p.in.cents / 100), y(p.out.cents / 100));
          return (
            <g key={i}>
              <path d={vBarPath(xIn, y(0), barW, y(0) - y(p.in.cents / 100))} fill={v(VAR.in)}>
                <Tip>{`${p.label} ${l.in.toLowerCase()}: ${p.in.display}`}</Tip>
              </path>
              <path d={vBarPath(xOut, y(0), barW, y(0) - y(p.out.cents / 100))} fill={v(VAR.out)}>
                <Tip>{`${p.label} ${l.out.toLowerCase()}: ${p.out.display}`}</Tip>
              </path>
              <Label x={gx} y={topY - 8} size={FONT.sm} weight={700} anchor="middle" numeric>
                {`${l.net} ${p.net.display}`}
              </Label>
              <Label x={gx} y={top + plotH + 18} size={FONT.sm} anchor="middle" soft>
                {p.label}
              </Label>
            </g>
          );
        })}
      </Svg>
    </Figure>
  );
}
