/**
 * The frame every chart ships in: a `<figure>` whose caption states the takeaway, the SVG with its accessible
 * name, and the data table twin behind a native `<details>` toggle (works with no JavaScript, in email-safe
 * static markup and in the app's WebView). Theme variables are set inline when `theme` is given so the markup is
 * self-contained for PNG rendering and snapshots; the web viewer sets them on `:root` instead.
 */
import type { ReactElement, ReactNode } from 'react';

import type { Locale } from '@hesabu/report-model';

import { chartLabels } from './labels.js';
import { themeStyle } from './theme.js';
import type { Theme } from './tokens.js';

export interface DataTableSpec {
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  /** indexes of right-aligned numeric columns */
  readonly numeric: readonly number[];
}

export interface FigureProps {
  readonly id: string;
  readonly title: string;
  readonly takeaway?: string | null;
  readonly altText: string;
  readonly locale: Locale;
  readonly theme?: Theme;
  readonly table: DataTableSpec;
  readonly children: ReactNode;
  /** When false the toggle is omitted (hero image, email). */
  readonly showTable?: boolean;
  readonly width: number;
}

export function Figure({ id, title, takeaway, altText, locale, theme, table, children, showTable = true, width }: FigureProps): ReactElement {
  const l = chartLabels(locale);
  return (
    <figure
      className="h-chart"
      data-chart-id={id}
      style={{ ...(theme ? themeStyle(theme) : {}), maxWidth: width, margin: 0 }}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-alt`}
    >
      <figcaption className="h-chart__caption">
        <span id={`${id}-title`} className="h-chart__title">
          {title}
        </span>
        {takeaway ? <span className="h-chart__takeaway">{takeaway}</span> : null}
      </figcaption>
      <div className="h-chart__plot">{children}</div>
      <p id={`${id}-alt`} className="h-visually-hidden">
        {altText}
      </p>
      {showTable ? (
        <details className="h-chart__data">
          <summary className="h-chart__toggle">{l.showTable}</summary>
          <DataTable spec={table} caption={`${l.chartData}: ${title}`} />
        </details>
      ) : null}
    </figure>
  );
}

export function DataTable({ spec, caption }: { readonly spec: DataTableSpec; readonly caption: string }): ReactElement {
  const numeric = new Set(spec.numeric);
  return (
    <table className="h-ledger h-ledger--compact">
      <caption className="h-visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {spec.columns.map((c, i) => (
            <th key={i} scope="col" className={numeric.has(i) ? 'h-num' : undefined}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {spec.rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j} className={numeric.has(j) ? 'h-num' : undefined}>
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface SvgProps {
  readonly width: number;
  readonly height: number;
  readonly altText: string;
  readonly children: ReactNode;
  readonly chartType: string;
}

/** The SVG root: explicit size plus viewBox, `role="img"` with the alt text as its name. */
export function Svg({ width, height, altText, children, chartType }: SvgProps): ReactElement {
  return (
    <svg
      role="img"
      aria-label={altText}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-chart={chartType}
      style={{ display: 'block', width: '100%', height: 'auto', fontFamily: 'var(--h-font)' }}
    >
      <title>{altText}</title>
      {children}
    </svg>
  );
}
