import type { ReactElement } from 'react';

import { formatKsh, type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { GAP, HRule, Label, Tip } from '../primitives.js';
import { px } from '../scale.js';
import { catVar, v, VAR } from '../theme.js';
import { fit, textWidth } from '../text.js';
import { FONT, MAX_DONUT_SLICES } from '../tokens.js';

export interface DonutSlice {
  readonly name: string;
  readonly cents: number;
  readonly display: string;
  /** share as a whole percent display, e.g. "30%" */
  readonly share: string;
  readonly isOther?: boolean;
}

export interface DonutData {
  readonly slices: readonly DonutSlice[];
  readonly total: { readonly cents: number; readonly display: string };
}

export interface DonutProps extends BaseChartProps {
  readonly data: DonutData;
}

/** Folds anything past the six largest slices into Other. */
export function foldSlices(slices: readonly DonutSlice[], otherLabel: string): DonutSlice[] {
  const sorted = [...slices].sort((a, b) => b.cents - a.cents);
  if (sorted.length <= MAX_DONUT_SLICES) return sorted;
  const top = sorted.slice(0, MAX_DONUT_SLICES);
  const rest = sorted.slice(MAX_DONUT_SLICES);
  const cents = rest.reduce((a, s) => a + s.cents, 0);
  const total = sorted.reduce((a, s) => a + s.cents, 0);
  const share = total ? Math.round((cents / total) * 100) : 0;
  return [...top, { name: otherLabel, cents, display: formatKsh(cents), share: `${share}%`, isOther: true }];
}

export function donutAltText(data: DonutData, locale: Locale): string {
  const l = chartLabels(locale);
  const parts = data.slices.map((s) => `${s.name} ${s.display} (${s.share})`).join(', ');
  return locale === 'sw'
    ? `Donati ya ${data.total.display} kwa kategoria: ${parts}.`
    : `${l.total} ${data.total.display} by category: ${parts}.`;
}

export function donutTable(data: DonutData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return {
    columns: [l.category, l.amount, l.share],
    rows: [...data.slices.map((s) => [s.name, s.display, s.share]), [l.total, data.total.display, '100%']],
    numeric: [1, 2],
  };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${px(cx + r * Math.sin(a))} ${px(cy - r * Math.cos(a))}`;
  return `M${p(rOuter, a0)} A${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, a1)} L${p(rInner, a1)} A${rInner} ${rInner} 0 ${large} 0 ${p(rInner, a0)} Z`;
}

export function Donut({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: DonutProps): ReactElement {
  const l = chartLabels(locale);
  const stacked = width < 480;
  const r = stacked ? Math.min(Math.round(width * 0.3), 112) : 112;
  const ring = Math.round(r * 0.34);
  const legendRow = 30;
  const legendW = stacked ? width : width - (2 * r + 56 + 24);
  const cx = stacked ? width / 2 : r + 28;
  const cy = r + 36;
  const legendX = stacked ? 0 : 2 * r + 56;
  const legendY = stacked ? 2 * r + 60 : Math.max(8, cy - (data.slices.length * legendRow) / 2);
  const height = stacked ? legendY + data.slices.length * legendRow + 8 : Math.max(2 * r + 60, legendY + data.slices.length * legendRow + 8);

  const total = Math.max(1, data.total.cents);
  // The largest slice straddles 12 o'clock so its outside label sits above the ring, clear of the legend.
  const firstSpan = data.slices[0] ? (data.slices[0].cents / total) * Math.PI * 2 : 0;
  let angle = -firstSpan / 2;
  const arcs = data.slices.map((s, i) => {
    const a0 = angle;
    const a1 = angle + (s.cents / total) * Math.PI * 2;
    angle = a1;
    return { s, i, a0, a1, mid: (a0 + a1) / 2 };
  });
  const top = arcs[0];
  const topLx = cx;
  const topLy = cy - r - 12;
  const hole = 2 * (r - ring);
  const totalSize = Math.min(FONT.xl, Math.floor((hole - 12) / Math.max(1, textWidth(data.total.display, 1))));

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={altText ?? donutAltText(data, locale)} locale={locale} theme={theme} table={donutTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={altText ?? donutAltText(data, locale)} chartType="donut">
        <g>
          {arcs.map(({ s, i, a0, a1 }) => (
            <path key={i} d={arcPath(cx, cy, r, r - ring, a0, Math.max(a1, a0 + 0.001))} fill={s.isOther ? v(VAR.other) : v(catVar(i))} stroke={v(VAR.sheet)} strokeWidth={GAP} strokeLinejoin="round">
              <Tip>{`${s.name}: ${s.display} (${s.share})`}</Tip>
            </path>
          ))}
        </g>
        <Label x={cx} y={cy + 2} size={totalSize} weight={700} anchor="middle" numeric>
          {data.total.display}
        </Label>
        <Label x={cx} y={cy + FONT.sm + 6} size={FONT.sm} anchor="middle" soft>
          {l.out}
        </Label>
        {top ? (
          <g>
            <line x1={px(cx)} y1={px(cy - r)} x2={px(topLx)} y2={px(topLy + 4)} stroke={v(VAR.inkSoft)} strokeWidth={1} />
            <Label x={topLx} y={topLy} size={FONT.sm} weight={500} anchor="middle">
              {`${top.s.name} ${top.s.share}`}
            </Label>
          </g>
        ) : null}
        <g>
          {data.slices.map((s, i) => {
            const y = legendY + i * legendRow;
            return (
              <g key={i}>
                <rect x={px(legendX)} y={px(y + 9)} width={10} height={10} rx={2} fill={s.isOther ? v(VAR.other) : v(catVar(i))} />
                <Label x={legendX + 18} y={y + 19} size={FONT.sm}>
                  {fit(s.name, legendW - 18 - 120, FONT.sm)}
                </Label>
                <Label x={legendX + legendW - 44} y={y + 19} size={FONT.sm} anchor="end" numeric>
                  {s.display}
                </Label>
                <Label x={legendX + legendW} y={y + 19} size={FONT.sm} anchor="end" soft numeric>
                  {s.share}
                </Label>
                <HRule x1={legendX} x2={legendX + legendW} y={y + legendRow - 0.5} />
              </g>
            );
          })}
        </g>
      </Svg>
    </Figure>
  );
}
