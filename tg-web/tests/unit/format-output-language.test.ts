import { describe, expect, it } from 'vitest';

import {
  formatOutputLanguage,
  normalizeOutputLanguageId,
} from '../../src/frontend/lib/format-output-language';

describe('normalizeOutputLanguageId', () => {
  it('maps known Core values and aliases', () => {
    expect(normalizeOutputLanguageId('Chinese')).toBe('Chinese');
    expect(normalizeOutputLanguageId('中文')).toBe('Chinese');
    expect(normalizeOutputLanguageId('english')).toBe('English');
  });

  it('returns null for unknown custom languages', () => {
    expect(normalizeOutputLanguageId('Turkish')).toBeNull();
    expect(normalizeOutputLanguageId('')).toBeNull();
  });
});

describe('formatOutputLanguage', () => {
  it('localizes known languages and keeps custom values', () => {
    const t = (key: string, options?: { defaultValue?: string }) => {
      if (key === 'outputLanguages.Chinese') return '中文';
      if (key === 'outputLanguages.English') return '英语';
      if (key === 'outputLanguages.Japanese') return '日语';
      return options?.defaultValue ?? key;
    };

    expect(formatOutputLanguage('Chinese', t)).toBe('中文');
    expect(formatOutputLanguage('English', t)).toBe('英语 · English');
    expect(formatOutputLanguage('Japanese', t)).toBe('日语 · 日本語');
    expect(formatOutputLanguage('Turkish', t)).toBe('Turkish');
  });

  it('keeps a single label when UI text matches the native name', () => {
    const t = (key: string, options?: { defaultValue?: string }) => {
      if (key === 'outputLanguages.English') return 'English';
      if (key === 'outputLanguages.Chinese') return 'Chinese';
      return options?.defaultValue ?? key;
    };

    expect(formatOutputLanguage('English', t)).toBe('English');
    expect(formatOutputLanguage('Chinese', t)).toBe('Chinese · 中文');
  });
});
