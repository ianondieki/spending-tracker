import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { chartStyles, reportStyles, themeStylesheet } from '@hesabu/charts';

import './globals.css';

export const metadata: Metadata = {
  title: 'Hesabu',
  // [[COPY-REVIEW]]
  description: 'Weekly and monthly money reports, computed from your own messages.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F5F7' },
    { media: '(prefers-color-scheme: dark)', color: '#101722' },
  ],
};

// One inline stylesheet: theme variables, chart frames and the report ledger. No extra request on a slow network.
const inlineCss = `${themeStylesheet()}\n${chartStyles}\n${reportStyles}`;

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/SchibstedGrotesk-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: inlineCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
