import type { ReactElement } from 'react';

import { type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { Label, Tip } from '../primitives.js';
import { px } from '../scale.js';
import { v, VAR } from '../theme.js';
import { FONT } from '../tokens.js';

export interface FeeMeterData {
  readonly fees: { readonly cents: number; readonly display: string };
  readonly out: { readonly cents: number; readonly display: string };
  readonly ratio: { readonly value: number; readonly display: string };
}

export interface FeeMeterProps extends BaseChartProps {
  readonly data: FeeMeterData;
}

export function feeMeterAltText(data: FeeMeterData, locale: Locale): string {
  const l = chartLabels(locale);
  return locale === 'sw'
    ? `Ada ${data.fees.display}, ${data.ratio.display} ya ${data.out.display} zilizotumika.`
    : `${l.fees} ${data.fees.display}, ${data.ratio.display} ${l.ofSpending} ${data.out.display}.`;
}

export function feeMeterTable(data: FeeMeterData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return {
    columns: ['', l.amount],
    rows: [
      [l.fees, data.fees.display],
      [l.spent, data.out.display],
      [`${l.fees} ${l.ofSpending}`, data.ratio.display],
    ],
    numeric: [1],
  };
}

/** A short ruled bar, not a gauge: the track is everything spent, the warm fill is what moving it cost. */
export function FeeMeter({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: FeeMeterProps): ReactElement {
  const l = chartLabels(locale);
  const trackH = 14;
  const top = 24;
  const height = top + trackH + 24;
  const fraction = data.out.cents > 0 ? Math.min(1, data.fees.cents / data.out.cents) : 0;
  const fill = Math.max(3, Math.round(width * fraction));
  const alt = altText ?? feeMeterAltText(data, locale);
  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={feeMeterTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="fee_meter">
        <Label x={0} y={16} size={FONT.sm} weight={700} numeric>
          {`${data.fees.display} ${l.fees.toLowerCase()}`}
        </Label>
        <Label x={width} y={16} size={FONT.sm} anchor="end" soft numeric>
          {`${data.ratio.display} ${l.ofSpending} ${data.out.display}`}
        </Label>
        <rect x={0.5} y={px(top + 0.5)} width={px(width - 1)} height={trackH - 1} fill="none" stroke={v(VAR.rule)} strokeWidth={1} shapeRendering="crispEdges" />
        <rect x={0} y={px(top)} width={px(fill)} height={trackH} fill={v(VAR.fee)}>
          <Tip>{alt}</Tip>
        </rect>
        <Label x={0} y={top + trackH + 17} size={FONT.xs} soft>
          {l.fees}
        </Label>
        <Label x={width} y={top + trackH + 17} size={FONT.xs} anchor="end" soft>
          {l.spent}
        </Label>
      </Svg>
    </Figure>
  );
}
