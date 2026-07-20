import { describe, expect, it } from 'vitest';

import {
  interfaceLanguageToUiLocale,
  todayInTimezone,
  uiLocaleToInterfaceLanguage,
} from '../../src/frontend/i18n/locales';
import { snapshotFreshness } from '../../src/frontend/lib/snapshot-freshness';

describe('locale preference mapping', () => {
  it('maps UI locales to account interface languages', () => {
    expect(uiLocaleToInterfaceLanguage('en')).toBe('en');
    expect(uiLocaleToInterfaceLanguage('zh')).toBe('zh-CN');
  });

  it('maps account interface languages back to UI locales', () => {
    expect(interfaceLanguageToUiLocale('en')).toBe('en');
    expect(interfaceLanguageToUiLocale('zh-CN')).toBe('zh');
    expect(interfaceLanguageToUiLocale('zh-TW')).toBe('zh');
  });
});

describe('todayInTimezone', () => {
  it('returns a YYYY-MM-DD calendar date', () => {
    expect(todayInTimezone('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('snapshotFreshness', () => {
  it('marks missing or old quotes as stale', () => {
    expect(snapshotFreshness(undefined)).toBe('stale');
    expect(
      snapshotFreshness(new Date(Date.now() - 20 * 60 * 1000).toISOString()),
    ).toBe('stale');
  });

  it('marks recent quotes as as_of', () => {
    expect(
      snapshotFreshness(new Date(Date.now() - 60 * 1000).toISOString()),
    ).toBe('as_of');
  });
});
