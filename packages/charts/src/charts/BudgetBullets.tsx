import type { ReactElement } from 'react';

import { type Locale } from '@hesabu/report-model';

import { type BaseChartProps, DEFAULT_WIDTH } from '../common.js';
import { type DataTableSpec, Figure, Svg } from '../Figure.js';
import { chartLabels } from '../labels.js';
import { hBarPath, HRule, Label, Tip } from '../primitives.js';
import { linear, px } from '../scale.js';
import { v, VAR } from '../theme.js';
import { fit, humanName, textWidth } from '../text.js';
import { FONT } from '../tokens.js';

export interface BudgetItem {
  readonly name: string;
  readonly limit: { readonly cents: number; readonly display: string };
  readonly spent: { readonly cents: number; readonly display: string };
  readonly projected: { readonly cents: number; readonly display: string };
  readonly used: string;
  readonly status: 'ok' | 'watch' | 'over';
}

export interface BudgetBulletsData {
  readonly items: readonly BudgetItem[];
}

export interface BudgetBulletsProps extends BaseChartProps {
  readonly data: BudgetBulletsData;
}

export function budgetBulletsAltText(data: BudgetBulletsData, locale: Locale): string {
  const l = chartLabels(locale);
  return data.items
    .map((b) => `${b.name} ${b.spent.display} ${locale === 'sw' ? 'kati ya' : 'of'} ${b.limit.display} (${b.used})${b.projected.cents !== b.spent.cents ? `, ${l.projected.toLowerCase()} ${b.projected.display}` : ''}${b.status === 'over' ? `, ${l.over.toLowerCase()}` : ''}`)
    .join('; ') + '.';
}

export function budgetBulletsTable(data: BudgetBulletsData, locale: Locale): DataTableSpec {
  const l = chartLabels(locale);
  return {
    columns: [l.category, l.spent, l.limit, l.projected, ''],
    rows: data.items.map((b) => [b.name, b.spent.display, b.limit.display, b.projected.display, b.used]),
    numeric: [1, 2, 3, 4],
  };
}

/** Spent as a solid bar, projection as a hollow extension, the limit as a tick on the ruled track. */
export function BudgetBullets({ id, title, takeaway, locale, theme, width = DEFAULT_WIDTH, showTable, altText, data }: BudgetBulletsProps): ReactElement {
  const l = chartLabels(locale);
  const rowH = 54;
  const barH = 14;
  const nameW = Math.min(180, Math.round(width * 0.3));
  const valueW = Math.max(...data.items.map((b) => textWidth(b.used, FONT.sm))) + 16;
  const plotX = nameW + 12;
  const plotW = width - plotX - valueW;
  const max = Math.max(1, ...data.items.flatMap((b) => [b.limit.cents, b.spent.cents, b.projected.cents])) * 1.02;
  const x = linear([0, max], [0, plotW]);
  const height = data.items.length * rowH;
  const alt = altText ?? budgetBulletsAltText(data, locale);

  return (
    <Figure id={id} title={title} takeaway={takeaway} altText={alt} locale={locale} theme={theme} table={budgetBulletsTable(data, locale)} showTable={showTable} width={width}>
      <Svg width={width} height={height} altText={alt} chartType="budget_bullets">
        {data.items.map((b, i) => {
          const y = i * rowH;
          const barY = y + 18;
          const spent = x(b.spent.cents);
          const projected = x(Math.max(b.projected.cents, b.spent.cents));
          const limit = x(b.limit.cents);
          const spentW = textWidth(b.spent.display, FONT.xs);
          const freeAfter = Math.min(plotW, limit > spent + 4 ? limit - 4 : plotW) - (projected > spent ? projected : spent);
          const spentFits = freeAfter > spentW + 12 ? 'outside' : spent > spentW + 16 ? 'inside' : 'none';
          return (
            <g key={i}>
              <Label x={0} y={barY + barH / 2 + 5} size={FONT.sm}>
                {fit(humanName(b.name), nameW, FONT.sm)}
              </Label>
              <rect x={px(plotX + 0.5)} y={px(barY + 0.5)} width={px(plotW - 1)} height={barH - 1} fill="none" stroke={v(VAR.rule)} strokeWidth={1} shapeRendering="crispEdges" />
              {projected > spent ? <rect x={px(plotX + spent)} y={px(barY + 3)} width={px(projected - spent)} height={barH - 6} fill="none" stroke={v(VAR.inkSoft)} strokeWidth={1} /> : null}
              <path d={hBarPath(plotX, barY, spent, barH)} fill={v(VAR.out)}>
                <Tip>{`${b.name}: ${b.spent.display} ${locale === 'sw' ? 'kati ya' : 'of'} ${b.limit.display}, ${l.projected.toLowerCase()} ${b.projected.display}`}</Tip>
              </path>
              <line x1={px(plotX + limit)} x2={px(plotX + limit)} y1={px(barY - 4)} y2={px(barY + barH + 4)} stroke={v(VAR.ink)} strokeWidth={2} />
              <Label x={plotX + plotW + 8} y={barY + barH / 2 + 5} size={FONT.sm} weight={b.status === 'over' ? 700 : 400} numeric>
                {b.used}
              </Label>
              {spentFits === 'outside' ? (
                <Label x={plotX + spent + 6} y={barY + barH / 2 + 4} size={FONT.xs} numeric>
                  {b.spent.display}
                </Label>
              ) : spentFits === 'inside' ? (
                <Label x={plotX + spent - 6} y={barY + barH / 2 + 4} size={FONT.xs} anchor="end" fill={v(VAR.sheet)} numeric>
                  {b.spent.display}
                </Label>
              ) : null}
              <Label x={plotX + plotW} y={y + 12} size={FONT.xs} anchor="end" soft numeric>
                {`${l.limit} ${b.limit.display}${b.status === 'over' ? `, ${l.over.toLowerCase()}` : ''}`}
              </Label>
              {i < data.items.length - 1 ? <HRule x1={0} x2={width} y={y + rowH - 0.5} /> : null}
            </g>
          );
        })}
      </Svg>
    </Figure>
  );
}
