/**
 * Schibsted Grotesk (OFL) embedded as base64 `@font-face` rules so the standalone HTML, the PDF and the PNGs need
 * no network. The woff2 files live in `packages/charts/fonts/`.
 */
import { readFileSync } from 'node:fs';

const FONT_DIR = new URL('../../charts/fonts/', import.meta.url);

let cached: string | null = null;

export function fontFaceCss(): string {
  if (cached) return cached;
  const face = (file: string, style: 'normal' | 'italic') => {
    const data = readFileSync(new URL(file, FONT_DIR)).toString('base64');
    return `@font-face { font-family: "Schibsted Grotesk"; font-style: ${style}; font-weight: 400 900; font-display: block; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  };
  cached = `${face('SchibstedGrotesk-latin.woff2', 'normal')}\n${face('SchibstedGrotesk-Italic-latin.woff2', 'italic')}`;
  return cached;
}
