import type { ReactElement } from 'react';

import { type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { GAP, Label, Tip } from '../primitives.js';
import { px } from '../scale.js';
import { v, VAR } from '../theme.js';
import { FONT } from '../tokens.js';

export interface HeatDay {
  readonly date: string; // YYYY-MM-DD
  readonly cents: number;
  readonly display: string;
  readonly long: string;
}

export interface CalendarHeatmapData {
  readonly days: readonly HeatDay[];
}

export interface CalendarHeatmapProps extends BaseChartProps {
  readonly data: CalendarHeatmapData;
}

function weekdayIndex(date: string): number {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  return (d.getUTCDay() + 6) % 7;
}

/** Five opacity steps of ink: one hue, light to dark, quantised so the legend can name the bins. */
const STEPS = [0.08, 0.22, 0.4, 0.62, 0.88];

export function heatBin(cents: number, max: number): number {
  if (cents <= 0 || max <= 0) return 0;
  return Math.min(STEPS.length - 1, Math.floor((cents / max) * STEPS.length - 1e-9));
}

export function calendarHeatmapAltText(data: CalendarHeatmapData, locale: Locale): string {
  const sorted = [...data.days].sort((a, b) => b.cents - a.cents);
  const top = sorted.slice(0, 3).map((d) => `${d.long} ${d.display}`).join(', ');
  return locale === 'sw' ? `Kalenda ya siku ${data.days.length}; siku za juu zaidi: ${top}.` : `Calendar of ${data.days.length} days; heaviest days: ${top}.`;
}

export function calendarHeatmapTable(data: CalendarHeatmapData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return { columns: [l.date, l.amount], rows: data.days.map((d) => [d.long, d.display]), numeric: [1] };
}

export function CalendarHeatmap({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: CalendarHeatmapProps): ReactElement {
  const l = chartLabels(locale);
  const cell = Math.min(56, Math.floor((width - 6 * GAP) / 7));
  const gridW = cell * 7 + GAP * 6;
  const x0 = Math.floor((width - gridW) / 2);
  const first = data.days[0];
  const offset = first ? weekdayIndex(first.date) : 0;
  const rows = Math.ceil((offset + data.days.length) / 7);
  const top = 22;
  const height = top + rows * (cell + GAP) + 26;
  const max = Math.max(1, ...data.days.map((d) => d.cents));
  const alt = altText ?? calendarHeatmapAltText(data, locale);

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={calendarHeatmapTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="calendar_heatmap">
        {l.weekdays.map((w, i) => (
          <Label key={w} x={x0 + i * (cell + GAP) + cell / 2} y={14} size={FONT.xs} anchor="middle" soft>
            {w}
          </Label>
        ))}
        {data.days.map((d, i) => {
          const idx = offset + i;
          const col = idx % 7;
          const row = Math.floor(idx / 7);
          const x = x0 + col * (cell + GAP);
          const y = top + row * (cell + GAP);
          const bin = heatBin(d.cents, max);
          const dark = bin >= 3;
          return (
            <g key={d.date}>
              <rect x={px(x)} y={px(y)} width={cell} height={cell} rx={3} fill={v(VAR.ink)} opacity={STEPS[bin]}>
                <Tip>{`${d.long}: ${d.display}`}</Tip>
              </rect>
              <Label x={x + 6} y={y + FONT.xs + 3} size={FONT.xs} fill={dark ? v(VAR.sheet) : v(VAR.inkSoft)} numeric>
                {String(+d.date.slice(8, 10))}
              </Label>
            </g>
          );
        })}
        <g aria-hidden="true">
          {STEPS.map((o, i) => (
            <rect key={i} x={px(x0 + i * 14)} y={px(height - 16)} width={12} height={12} rx={2} fill={v(VAR.ink)} opacity={o} />
          ))}
          <Label x={x0 + STEPS.length * 14 + 4} y={height - 6} size={FONT.xs} soft>
            {locale === 'sw' ? 'chache hadi nyingi' : 'less to more'}
          </Label>
        </g>
      </Svg>
    </Figure>
  );
}
