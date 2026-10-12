import type { ReactElement } from 'react';

export interface ChartPlaceholderProps {
  /** Accessible name; also the chart's text summary until the real catalogue lands. */
  readonly title: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Placeholder chart: an empty, labelled frame so consumers can wire layout before the catalogue exists.
 * Every real chart keeps the same contract: a `<title>` for assistive tech and a text summary alongside.
 */
export function ChartPlaceholder({
  title,
  width = 320,
  height = 160,
}: ChartPlaceholderProps): ReactElement {
  return (
    <svg
      role="img"
      aria-label={title}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-chart="placeholder"
    >
      <title>{title}</title>
      <rect
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeDasharray="4 4"
      />
    </svg>
  );
}
