import type { ReactElement } from 'react';

import { type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { BAR_MAX, hBarPath, HRule, Label, Tip } from '../primitives.js';
import { linear, px } from '../scale.js';
import { v, VAR } from '../theme.js';
import { fit, textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface TopBarItem {
  readonly name: string;
  readonly cents: number;
  readonly display: string;
  readonly isNew?: boolean;
}

export interface TopBarsData {
  readonly items: readonly TopBarItem[];
  /** column header for the table, e.g. Merchant or Person */
  readonly nameLabel?: string;
}

export interface TopBarsProps extends BaseChartProps {
  readonly data: TopBarsData;
}

export function topBarsAltText(data: TopBarsData, locale: Locale): string {
  const l = chartLabels(locale);
  return data.items.map((m, i) => `${i + 1}. ${m.name} ${m.display}${m.isNew ? ` (${l.new.toLowerCase()})` : ''}`).join('; ') + '.';
}

export function topBarsTable(data: TopBarsData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return {
    columns: [data.nameLabel ?? l.merchant, l.amount, ''],
    rows: data.items.map((m) => [m.name, m.display, m.isNew ? l.new : '']),
    numeric: [1],
  };
}

export function TopBars({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: TopBarsProps): ReactElement {
  const l = chartLabels(locale);
  const items = [...data.items].sort((a, b) => b.cents - a.cents).slice(0, 8);
  const rowH = 34;
  const nameW = Math.round(Math.min(width * 0.38, 200));
  const valueW = Math.max(...items.map((m) => textWidth(m.display, FONT.sm))) + 12;
  const plotX = nameW + 12;
  const plotW = width - plotX - valueW;
  const max = Math.max(1, ...items.map((m) => m.cents));
  const x = linear([0, max], [0, plotW]);
  const height = items.length * rowH + 4;
  const alt = altText ?? topBarsAltText(data, locale);
  const barH = Math.min(BAR_MAX, 18);

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={topBarsTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="top_bars">
        {items.map((m, i) => {
          const y = i * rowH;
          const len = x(m.cents);
          const nameText = fit(m.name, nameW - (m.isNew ? 14 : 0), FONT.sm);
          return (
            <g key={i}>
              <Label x={0} y={y + rowH / 2 + 5} size={FONT.sm}>
                {nameText}
              </Label>
              {m.isNew ? (
                <circle cx={px(textWidth(nameText, FONT.sm) + 9)} cy={px(y + rowH / 2 + 1)} r={3.5} fill={v(VAR.biro)}>
                  <Tip>{l.new}</Tip>
                </circle>
              ) : null}
              <path d={hBarPath(plotX, y + (rowH - barH) / 2, len, barH)} fill={v(VAR.out)}>
                <Tip>{`${m.name}: ${m.display}${m.isNew ? ` (${l.new.toLowerCase()})` : ''}`}</Tip>
              </path>
              <Label x={plotX + len + 6} y={y + rowH / 2 + 5} size={FONT.sm} numeric>
                {m.display}
              </Label>
              <HRule x1={0} x2={width} y={y + rowH - 0.5} />
            </g>
          );
        })}
      </Svg>
    </Figure>
  );
}
