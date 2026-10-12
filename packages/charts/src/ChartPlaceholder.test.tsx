import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChartPlaceholder } from './index.js';

describe('ChartPlaceholder', () => {
  it('renders an accessible SVG frame with its title', () => {
    const html = renderToStaticMarkup(<ChartPlaceholder title="Spending by category" />);
    expect(html).toContain('<svg');
    expect(html).toContain('role="img"');
    expect(html).toContain('<title>Spending by category</title>');
  });
});
