/**
 * Shared SVG marks. Mark specs follow the dataviz skill: bars at most 24 px thick with a 4 px rounded data end and a
 * square baseline, 2 px lines, markers r ≥ 4 with a 2 px surface ring, hairline solid grid in the rule colour,
 * 2 px surface gaps between touching fills. Text always wears ink tokens, never a series colour.
 */
import type { ReactElement, ReactNode } from 'react';

import { px } from './scale.js';
import { FONT } from './tokens.js';
import { v, VAR } from './theme.js';

export const BAR_MAX = 24;
export const BAR_RADIUS = 4;
export const GAP = 2;
export const LINE = 2;
export const MARKER_R = 4;

/** A vertical bar growing up from `baseY` (or down when the value is negative) with a rounded data end. */
export function vBarPath(x: number, baseY: number, width: number, height: number): string {
  const r = Math.min(BAR_RADIUS, width / 2, Math.abs(height));
  if (height === 0) return '';
  if (height > 0) {
    const top = baseY - height;
    return `M${px(x)} ${px(baseY)} V${px(top + r)} Q${px(x)} ${px(top)} ${px(x + r)} ${px(top)} H${px(x + width - r)} Q${px(x + width)} ${px(top)} ${px(x + width)} ${px(top + r)} V${px(baseY)} Z`;
  }
  const bottom = baseY - height; // height negative
  return `M${px(x)} ${px(baseY)} V${px(bottom - r)} Q${px(x)} ${px(bottom)} ${px(x + r)} ${px(bottom)} H${px(x + width - r)} Q${px(x + width)} ${px(bottom)} ${px(x + width)} ${px(bottom - r)} V${px(baseY)} Z`;
}

/** A horizontal bar growing right from `baseX` with a rounded data end. */
export function hBarPath(baseX: number, y: number, length: number, height: number): string {
  const r = Math.min(BAR_RADIUS, height / 2, length);
  if (length <= 0) return '';
  const end = baseX + length;
  return `M${px(baseX)} ${px(y)} H${px(end - r)} Q${px(end)} ${px(y)} ${px(end)} ${px(y + r)} V${px(y + height - r)} Q${px(end)} ${px(y + height)} ${px(end - r)} ${px(y + height)} H${px(baseX)} Z`;
}

export interface TextProps {
  readonly x: number;
  readonly y: number;
  readonly children: ReactNode;
  readonly size?: number;
  readonly weight?: 400 | 500 | 700;
  readonly anchor?: 'start' | 'middle' | 'end';
  readonly soft?: boolean;
  readonly numeric?: boolean;
  readonly baseline?: 'auto' | 'middle' | 'hanging';
  readonly fill?: string;
  readonly className?: string;
}

/** SVG text in the ink tokens. `numeric` marks amounts (proportional figures: tabular commas read wide in SVG). */
export function Label({
  x,
  y,
  children,
  size = FONT.sm,
  weight = 400,
  anchor = 'start',
  soft = false,
  numeric = false,
  baseline = 'auto',
  fill,
  className,
}: TextProps): ReactElement {
  return (
    <text
      x={px(x)}
      y={px(y)}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      dominantBaseline={baseline}
      fill={fill ?? v(soft ? VAR.inkSoft : VAR.ink)}
      fontFamily={v(VAR.font)}
      className={className}
      data-numeric={numeric ? '' : undefined}
    >
      {children}
    </text>
  );
}

export interface RuleProps {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly strong?: boolean;
}

/** A hairline horizontal rule in the rule colour; `strong` draws it in ink for a baseline. */
export function HRule({ x1, x2, y, strong = false }: RuleProps): ReactElement {
  return (
    <line
      x1={px(x1)}
      x2={px(x2)}
      y1={px(y)}
      y2={px(y)}
      stroke={v(strong ? VAR.ink : VAR.rule)}
      strokeWidth={1}
      shapeRendering="crispEdges"
    />
  );
}

export function VRule({ x, y1, y2 }: { readonly x: number; readonly y1: number; readonly y2: number }): ReactElement {
  return <line x1={px(x)} x2={px(x)} y1={px(y1)} y2={px(y2)} stroke={v(VAR.rule)} strokeWidth={1} shapeRendering="crispEdges" />;
}

/** A marker with the 2 px surface ring. */
export function Marker({ cx, cy, fill, r = MARKER_R, children }: { readonly cx: number; readonly cy: number; readonly fill: string; readonly r?: number; readonly children?: ReactNode }): ReactElement {
  return (
    <circle cx={px(cx)} cy={px(cy)} r={r} fill={fill} stroke={v(VAR.sheet)} strokeWidth={GAP}>
      {children}
    </circle>
  );
}

export function Tip({ children }: { readonly children: string }): ReactElement {
  return <title>{children}</title>;
}

export function polyline(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y]) => `${px(x)},${px(y)}`).join(' ');
}
