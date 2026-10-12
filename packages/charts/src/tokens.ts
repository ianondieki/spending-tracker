/**
 * Design tokens, copied from `contracts/design-tokens.json` (run `pnpm tokens`; a test fails when the copy is
 * stale). Charts never hard-code a colour: every fill and stroke is a CSS variable from `theme.ts`.
 */
import tokens from './design-tokens.json' with { type: 'json' };

export type Theme = 'light' | 'dark';
export const designTokens = tokens;

export const FONT_FAMILY = `"${tokens.font.family}", ${tokens.font.fallback}`;
export const FONT = tokens.font.scale_px;
export const SPACE = tokens.space_px;
export const RULE_PX = tokens.rule_px;
export const MAX_DONUT_SLICES = tokens.charts.max_donut_slices;
export const HERO = tokens.hero_image;

export type SemanticColor = keyof typeof tokens.color.light;

export function colors(theme: Theme) {
  return tokens.color[theme];
}

export function categorical(theme: Theme): readonly string[] {
  return tokens.charts.categorical[theme];
}
