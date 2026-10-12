/** Props every chart shares. Widths are the laid-out pixel width; height follows from the data. */
import type { Locale } from '@hesabu/report-model';

import type { Theme } from './tokens.js';

export interface BaseChartProps {
  readonly id: string;
  readonly title: string;
  readonly takeaway?: string | null;
  readonly locale: Locale;
  readonly theme?: Theme;
  readonly width?: number;
  readonly showTable?: boolean;
  /** Override the computed alt text (the ReportDocument carries the writer's own). */
  readonly altText?: string;
}

export const DEFAULT_WIDTH = 672;
export const PHONE_WIDTH = 328;
