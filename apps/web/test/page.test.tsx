import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage from '../app/page';

describe('home page', () => {
  it('renders the product name and a placeholder chart', () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain('<h1>Hesabu</h1>');
    expect(html).toContain('data-chart="placeholder"');
  });
});
