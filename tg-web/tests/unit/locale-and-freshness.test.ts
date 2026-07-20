import { describe, expect, it } from 'vitest';

import {
  interfaceLanguageToUiLocale,
  todayInTimezone,
  uiLocaleToInterfaceLanguage,
} from '../../src/frontend/i18n/locales';
import {
  formatSnapshotDelay,
  parseUpdateModeDelaySeconds,
  snapshotFreshness,
} from '../../src/frontend/lib/snapshot-freshness';

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

describe('parseUpdateModeDelaySeconds', () => {
  it('parses streaming and delayed_streaming_N modes', () => {
    expect(parseUpdateModeDelaySeconds('streaming')).toBe(0);
    expect(parseUpdateModeDelaySeconds('delayed_streaming_900')).toBe(900);
    expect(parseUpdateModeDelaySeconds('delayed_900')).toBe(900);
    expect(parseUpdateModeDelaySeconds('unknown')).toBeNull();
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

  it('uses update_mode delay over as_of age', () => {
    expect(
      snapshotFreshness({
        asOf: new Date().toISOString(),
        updateMode: 'delayed_streaming_900',
      }),
    ).toBe('stale');
    expect(
      snapshotFreshness({
        asOf: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        updateMode: 'streaming',
      }),
    ).toBe('as_of');
  });
});

describe('formatSnapshotDelay', () => {
  it('formats vendor delay from update_mode seconds', () => {
    expect(
      formatSnapshotDelay({ updateMode: 'delayed_streaming_900' }),
    ).toBe('15m');
    expect(formatSnapshotDelay({ delaySeconds: 900 })).toBe('15m');
    expect(formatSnapshotDelay({ updateMode: 'streaming' })).toBeNull();
  });

  it('formats minute, hour, and day ages when mode is unknown', () => {
    expect(
      formatSnapshotDelay(new Date(Date.now() - 23 * 60 * 1000).toISOString()),
    ).toBe('23m');
    expect(
      formatSnapshotDelay(
        new Date(Date.now() - (4 * 60 + 12) * 60 * 1000).toISOString(),
      ),
    ).toBe('4h 12m');
    expect(
      formatSnapshotDelay(
        new Date(Date.now() - (1 * 24 * 60 + 3 * 60) * 60 * 1000).toISOString(),
      ),
    ).toBe('1d 3h');
  });

  it('returns null when as_of is missing', () => {
    expect(formatSnapshotDelay(undefined)).toBeNull();
  });
});
