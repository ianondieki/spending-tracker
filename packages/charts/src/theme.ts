/**
 * Theme as CSS custom properties. Charts reference `var(--h-ink)` and friends; a page sets the variables once on
 * `:root` (web viewer) or each SVG carries them inline (renderer, email, snapshots) so the markup is self-contained.
 */
import type { CSSProperties } from 'react';

import { categorical, colors, designTokens, FONT_FAMILY, type Theme } from './tokens.js';

export const VAR = {
  paper: '--h-paper',
  sheet: '--h-sheet',
  rule: '--h-rule',
  ink: '--h-ink',
  inkSoft: '--h-ink-soft',
  biro: '--h-biro',
  onBiro: '--h-on-biro',
  in: '--h-in',
  out: '--h-out',
  fee: '--h-fee',
  transfer: '--h-transfer',
  warn: '--h-warn',
  other: '--h-other',
  average: '--h-average',
  font: '--h-font',
} as const;

export function catVar(index: number): string {
  return `--h-cat-${index + 1}`;
}

/** The variable map for a theme: suitable for an inline `style` or for building a stylesheet. */
export function themeVars(theme: Theme): Record<string, string> {
  const c = colors(theme);
  const vars: Record<string, string> = {
    [VAR.paper]: c.paper,
    [VAR.sheet]: c.sheet,
    [VAR.rule]: c.rule,
    [VAR.ink]: c.ink,
    [VAR.inkSoft]: c.ink_soft,
    [VAR.biro]: c.biro,
    [VAR.onBiro]: c.on_biro,
    [VAR.in]: c.in,
    [VAR.out]: c.out,
    [VAR.fee]: c.fee,
    [VAR.transfer]: c.transfer,
    [VAR.warn]: c.warn,
    [VAR.other]: designTokens.charts.other_slice[theme],
    [VAR.average]: designTokens.charts.average_line[theme],
    [VAR.font]: FONT_FAMILY,
  };
  categorical(theme).forEach((hex, i) => {
    vars[catVar(i)] = hex;
  });
  return vars;
}

/** Inline style carrying the theme variables (React accepts custom properties in `style`). */
export function themeStyle(theme: Theme): CSSProperties {
  return themeVars(theme) as CSSProperties;
}

/** A stylesheet that sets the variables on `:root` for light, and for dark under `[data-theme="dark"]`. */
export function themeStylesheet(): string {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
  return [
    `:root, [data-theme="light"] {\n${block(themeVars('light'))}\n  color-scheme: light;\n}`,
    `[data-theme="dark"] {\n${block(themeVars('dark'))}\n  color-scheme: dark;\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${block(themeVars('dark'))}\n    color-scheme: dark;\n  }\n}`,
    // Paper is always light: the PDF and a printed page use the light palette whatever the screen theme.
    `@media print {\n  :root, [data-theme="dark"], [data-theme="light"] {\n${block(themeVars('light'))}\n    color-scheme: light;\n  }\n}`,
  ].join('\n');
}

export const v = (name: string): string => `var(${name})`;
