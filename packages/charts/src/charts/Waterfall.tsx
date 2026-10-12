import type { ReactElement } from 'react';

import { compactKsh, formatKsh, type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { GAP, HRule, Label, Tip } from '../primitives.js';
import { linear, niceMax, px, ticks } from '../scale.js';
import { v, VAR } from '../theme.js';
import { fit, humanName, textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface WaterfallStep {
  readonly label: string;
  readonly cents: number;
  readonly display: string;
  readonly kind: 'income' | 'category' | 'other' | 'fees' | 'net';
}

export interface WaterfallData {
  readonly steps: readonly WaterfallStep[];
}

export interface WaterfallProps extends BaseChartProps {
  readonly data: WaterfallData;
}

/** income → top five categories → Other → fees → net, with Other computed so the steps add up exactly. */
export function waterfallSteps(
  income: { cents: number; display: string },
  categories: ReadonlyArray<{ name: string; cents: number; display: string }>,
  fees: { cents: number; display: string },
  net: { cents: number; display: string },
  labels: { income: string; other: string; fees: string; net: string },
): WaterfallStep[] {
  const sorted = [...categories].sort((a, b) => b.cents - a.cents);
  const top = sorted.slice(0, 5);
  const restCents = sorted.slice(5).reduce((a, c) => a + c.cents, 0);
  const steps: WaterfallStep[] = [{ label: labels.income, cents: income.cents, display: income.display, kind: 'income' }];
  for (const c of top) steps.push({ label: humanName(c.name), cents: -c.cents, display: c.display, kind: 'category' });
  if (restCents > 0) steps.push({ label: labels.other, cents: -restCents, display: formatKsh(restCents), kind: 'other' });
  steps.push({ label: labels.fees, cents: -fees.cents, display: fees.display, kind: 'fees' });
  steps.push({ label: labels.net, cents: net.cents, display: net.display, kind: 'net' });
  return steps;
}

export function waterfallAltText(data: WaterfallData, locale: Locale): string {
  const l = chartLabels(locale);
  return data.steps.map((s) => `${s.label} ${s.display}`).join(', ') + (locale === 'sw' ? ` (${l.net.toLowerCase()}).` : '.');
}

export function waterfallTable(data: WaterfallData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return { columns: ['', l.amount], rows: data.steps.map((s) => [s.label, s.display]), numeric: [1] };
}

export function Waterfall(props: WaterfallProps): ReactElement {
  return (props.width ?? DEFAULT_WIDTH) < 480 ? <WaterfallRows {...props} /> : <WaterfallColumns {...props} />;
}

/** Narrow layout: one ruled row per step with a floating horizontal bar, label left and amount right. */
function WaterfallRows({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: WaterfallProps): ReactElement {
  const steps = data.steps;
  let running = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'net') return { s, x0: 0, x1: s.cents };
    const x0 = running;
    running += s.cents;
    return { s, x0, x1: running };
  });
  const maxV = Math.max(1, ...bars.flatMap((b) => [b.x0, b.x1]));
  const minV = Math.min(0, ...bars.flatMap((b) => [b.x0, b.x1]));
  const rowH = 34;
  const barH = 14;
  const nameW = Math.round(width * 0.32);
  const valueW = Math.max(...steps.map((s) => textWidth(s.display, FONT.sm))) + 10;
  const plotX = nameW + 8;
  const plotW = width - plotX - valueW - 8;
  const x = linear([minV, maxV], [plotX, plotX + plotW]);
  const height = steps.length * rowH;
  const alt = altText ?? waterfallAltText(data, locale);
  const fillFor = (k: WaterfallStep['kind']) => (k === 'income' ? v(VAR.in) : k === 'fees' ? v(VAR.fee) : k === 'net' ? v(VAR.transfer) : k === 'other' ? v(VAR.other) : v(VAR.out));
  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={waterfallTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="waterfall">
        <line x1={px(x(0))} x2={px(x(0))} y1={0} y2={px(height)} stroke={v(VAR.rule)} strokeWidth={1} shapeRendering="crispEdges" />
        {bars.map((b, i) => {
          const y = i * rowH;
          const left = Math.min(x(b.x0), x(b.x1));
          const w = Math.max(1, Math.abs(x(b.x1) - x(b.x0)));
          const next = bars[i + 1];
          return (
            <g key={i}>
              <Label x={0} y={y + rowH / 2 + 5} size={FONT.sm}>
                {fit(b.s.label, nameW - 4, FONT.sm)}
              </Label>
              <rect x={px(left)} y={px(y + (rowH - barH) / 2)} width={px(w)} height={barH} rx={2} fill={fillFor(b.s.kind)}>
                <Tip>{`${b.s.label}: ${b.s.display}`}</Tip>
              </rect>
              {next && next.s.kind !== 'net' ? (
                <line x1={px(x(b.x1))} x2={px(x(b.x1))} y1={px(y + (rowH + barH) / 2)} y2={px(y + rowH + (rowH - barH) / 2)} stroke={v(VAR.inkSoft)} strokeWidth={1} strokeDasharray="2 2" />
              ) : null}
              <Label x={width} y={y + rowH / 2 + 5} size={FONT.sm} anchor="end" weight={b.s.kind === 'income' || b.s.kind === 'net' ? 700 : 400} numeric>
                {b.s.display}
              </Label>
              <HRule x1={0} x2={width} y={y + rowH - 0.5} />
            </g>
          );
        })}
      </Svg>
    </Figure>
  );
}

function WaterfallColumns({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: WaterfallProps): ReactElement {
  const steps = data.steps;
  const n = steps.length;
  let running = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'net') return { s, y0: 0, y1: s.cents };
    const y0 = running;
    running += s.cents;
    return { s, y0, y1: running };
  });
  const maxV = niceMax(Math.max(...bars.flatMap((b) => [b.y0, b.y1])) / 100);
  const minV = Math.min(0, ...bars.flatMap((b) => [b.y0, b.y1])) / 100;
  const yTicks = ticks(minV, maxV, 4);
  const left = 44;
  const top = 24;
  const plotH = 220;
  const bottom = 40;
  const height = top + plotH + bottom;
  const plotX = left;
  const plotW = width - left - 8;
  const band = plotW / n;
  const barW = Math.min(28, band - GAP * 2);
  const y = linear([yTicks[0] ?? 0, yTicks[yTicks.length - 1] ?? maxV], [top + plotH, top]);
  const alt = altText ?? waterfallAltText(data, locale);
  const fillFor = (k: WaterfallStep['kind']) => (k === 'income' ? v(VAR.in) : k === 'fees' ? v(VAR.fee) : k === 'net' ? v(VAR.transfer) : k === 'other' ? v(VAR.other) : v(VAR.out));

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={waterfallTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="waterfall">
        {yTicks.map((t) => (
          <g key={t}>
            <HRule x1={plotX} x2={plotX + plotW} y={y(t)} strong={t === 0} />
            <Label x={plotX - 6} y={y(t) + 4} size={FONT.xs} anchor="end" soft numeric>
              {compactKsh(t)}
            </Label>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = plotX + i * band + (band - barW) / 2;
          const yTop = Math.min(y(b.y0 / 100), y(b.y1 / 100));
          const h = Math.max(1, Math.abs(y(b.y0 / 100) - y(b.y1 / 100)));
          const next = bars[i + 1];
          const words = b.s.label.split(' ');
          const line1 = fit(words.length > 1 && b.s.label.length > 10 ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : b.s.label, band - 4, FONT.xs);
          const line2 = words.length > 1 && b.s.label.length > 10 ? fit(words.slice(Math.ceil(words.length / 2)).join(' '), band - 4, FONT.xs) : null;
          return (
            <g key={i}>
              <rect x={px(x)} y={px(yTop)} width={px(barW)} height={px(h)} rx={2} fill={fillFor(b.s.kind)}>
                <Tip>{`${b.s.label}: ${b.s.display}`}</Tip>
              </rect>
              {next && next.s.kind !== 'net' ? (
                <line x1={px(x + barW)} x2={px(plotX + (i + 1) * band + (band - barW) / 2)} y1={px(y(b.y1 / 100))} y2={px(y(b.y1 / 100))} stroke={v(VAR.inkSoft)} strokeWidth={1} strokeDasharray="2 2" />
              ) : null}
              {b.s.kind === 'income' || b.s.kind === 'net' ? (
                <Label x={x + barW / 2} y={yTop - 6} size={FONT.xs} weight={700} anchor="middle" numeric>
                  {b.s.display}
                </Label>
              ) : null}
              <Label x={x + barW / 2} y={top + plotH + 16} size={FONT.xs} anchor="middle" soft>
                {line1}
              </Label>
              {line2 ? (
                <Label x={x + barW / 2} y={top + plotH + 30} size={FONT.xs} anchor="middle" soft>
                  {line2}
                </Label>
              ) : null}
            </g>
          );
        })}
      </Svg>
    </Figure>
  );
}
