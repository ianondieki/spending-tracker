import { describe, expect, it } from 'vitest';

import { isLocale, LOCALES, t } from './index.js';

describe('i18n placeholder', () => {
  it('has English and Kiswahili', () => {
    expect(LOCALES).toEqual(['en', 'sw']);
    expect(isLocale('sw')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('translates known keys in both locales', () => {
    expect(t('en', 'app.name')).toBe('Hesabu');
    expect(t('en', 'report.weekly.title')).toBe('Your week in money');
    expect(t('sw', 'report.weekly.title')).toBe('Wiki yako ya pesa');
  });
});
