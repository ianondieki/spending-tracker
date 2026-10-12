/** Standalone HTML documents with every style inline (theme variables, chart frames, ledger, fonts). */
import { chartStyles, reportStyles, themeStylesheet, type Theme } from '@hesabu/charts';
import type { Locale } from '@hesabu/report-model';

import { fontFaceCss } from './fonts.js';

export interface PageOptions {
  readonly title: string;
  readonly locale: Locale;
  readonly theme: Theme;
  readonly body: string;
  /** Extra CSS after the shared sheets. */
  readonly css?: string;
  readonly description?: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

const BASE_CSS = `
html, body { margin: 0; padding: 0; }
body { font-family: var(--h-font); font-size: 16px; line-height: 1.45; background: var(--h-paper); color: var(--h-ink); -webkit-text-size-adjust: 100%; }
.h-page { min-height: 100vh; background: var(--h-paper); color: var(--h-ink); }
.h-page--report { padding: 0; }
@media (min-width: 720px) { .h-page--report { padding: 32px 16px; } }
`;

export function standalonePage({ title, locale, theme, body, css = '', description }: PageOptions): string {
  return (
    `<!doctype html>\n<html lang="${locale}" data-theme="${theme}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="color-scheme" content="${theme}">\n` +
    `<meta name="robots" content="noindex">\n<title>${escapeHtml(title)}</title>\n` +
    (description ? `<meta name="description" content="${escapeHtml(description)}">\n` : '') +
    `<style>\n${fontFaceCss()}\n${themeStylesheet()}\n${BASE_CSS}\n${chartStyles}\n${reportStyles}\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
  );
}
