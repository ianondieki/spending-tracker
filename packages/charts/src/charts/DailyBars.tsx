import type { ReactElement } from 'react';

import { compactKsh, formatKsh, type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { BAR_MAX, GAP, HRule, Label, Tip, vBarPath } from '../primitives.js';
import { linear, niceMax, px, ticks } from '../scale.js';
import { v, VAR } from '../theme.js';
import { textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface DailyBar {
  readonly label: string;
  /** full label for the table and tooltip, e.g. "Friday 9 October" */
  readonly long: string;
  readonly cents: number;
  readonly display: string;
}

export interface DailyBarsData {
  readonly bars: readonly DailyBar[];
  readonly average: { readonly cents: number; readonly display: string };
}

export interface DailyBarsProps extends BaseChartProps {
  readonly data: DailyBarsData;
}

export function spendiest(bars: readonly DailyBar[]): number {
  return bars.reduce((best, b, i) => (bars[best]!.cents >= b.cents ? best : i), 0);
}

export function dailyBarsAltText(data: DailyBarsData, locale: Locale): string {
  const l = chartLabels(locale);
  const top = data.bars[spendiest(data.bars)];
  const list = data.bars.map((b) => `${b.label} ${b.display}`).join(', ');
  return locale === 'sw'
    ? `Miraba ${data.bars.length} ya matumizi ya kila siku, wastani ${data.average.display}; siku ya juu zaidi ${top?.long ?? ''} ${top?.display ?? ''}. ${list}.`
    : `${data.bars.length} daily spending bars, ${l.average.toLowerCase()} ${data.average.display}; highest ${top?.long ?? ''} at ${top?.display ?? ''}. ${list}.`;
}

export function dailyBarsTable(data: DailyBarsData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return {
    columns: [l.day, l.amount],
    rows: [...data.bars.map((b) => [b.long, b.display]), [l.average, data.average.display]],
    numeric: [1],
  };
}

export function DailyBars({
  id,
  title,
  takeaway,
  locale,
  theme,
  width = DEFAULT_WIDTH,
  showTable,
  altText,
  data,
}: DailyBarsProps): ReactElement {
  const l = chartLabels(locale);
  const n = data.bars.length;
  const monthly = n > 10;
  const max = niceMax(Math.max(...data.bars.map((b) => b.cents), data.average.cents) / 100);
  const yTicks = ticks(0, max, 4);
  const left = Math.ceil(textWidth(compactKsh(max), FONT.xs)) + 10;
  const top = 26;
  const bottom = 24;
  const plotH = 180;
  const height = top + plotH + bottom;
  const plotX = left;
  // The average label lives in a reserved margin at the end of the line, never over a bar. When the full label
  // would take more than a quarter of the width (phone, monthly) only the word is shown; the amount stays in the
  // takeaway and the table.
  const fullLabel = `${l.average} ${data.average.display}`;
  const avgLabel = textWidth(fullLabel, FONT.xs) > width * 0.25 ? l.average : fullLabel;
  const avgLabelW = Math.ceil(textWidth(avgLabel, FONT.xs)) + 8;
  const plotW = width - left - avgLabelW - 8;
  const band = plotW / n;
  const barW = Math.min(BAR_MAX, Math.max(3, band - GAP * 2));
  const y = linear([0, max], [top + plotH, top]);
  const best = spendiest(data.bars);
  const avgY = y(data.average.cents / 100);
  const alt = altText ?? dailyBarsAltText(data, locale);

  return (
    <Figure
      id={id}
      title={title}
      takeaway={takeaway}
      altText={alt}
      locale={locale}
      theme={theme}
      table={dailyBarsTable(data, locale)}
      showTable={showTable}
      width={width}
    >
      <Svg width={width} height={height} altText={alt} chartType="daily_bars">
        {yTicks.map((t) => (
          <g key={t}>
            <HRule x1={plotX} x2={plotX + plotW} y={y(t)} strong={t === 0} />
            <Label x={plotX - 6} y={y(t) + 4} size={FONT.xs} anchor="end" soft numeric>
              {compactKsh(t)}
            </Label>
          </g>
        ))}
        {data.bars.map((b, i) => {
          const x = plotX + i * band + (band - barW) / 2;
          const h = y(0) - y(b.cents / 100);
          const labelEvery = monthly ? 7 : 1;
          const showLabel = i % labelEvery === 0;
          return (
            <g key={i}>
              <path d={vBarPath(x, y(0), barW, h)} fill={v(VAR.out)}>
                <Tip>{`${b.long}: ${b.display}`}</Tip>
              </path>
              {showLabel ? (
                <Label x={x + barW / 2} y={top + plotH + 17} size={FONT.xs} anchor="middle" soft>
                  {b.label}
                </Label>
              ) : null}
              {i === best ? (
                <Label
                  x={x + barW / 2}
                  y={y(b.cents / 100) - 6}
                  size={FONT.sm}
                  weight={700}
                  anchor={monthly && i > n - 4 ? 'end' : monthly && i < 3 ? 'start' : 'middle'}
                  numeric
                >
                  {b.display}
                </Label>
              ) : null}
            </g>
          );
        })}
        <line
          x1={px(plotX)}
          x2={px(plotX + plotW)}
          y1={px(avgY)}
          y2={px(avgY)}
          stroke={v(VAR.average)}
          strokeWidth={1.5}
        />
        <Label x={plotX + plotW + 6} y={avgY + 4} size={FONT.xs} anchor="start" soft>
          {avgLabel}
        </Label>
      </Svg>
    </Figure>
  );
}

/** Helper for consumers: a bar label for a day index in a weekly chart. */
export function dayShort(weekday: string): string {
  return weekday.slice(0, 3);
}

export { formatKsh };
