import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from '../../src/frontend/i18n';
import {
  formatLocaleCalendarDate,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleDateTimeValue,
  localeDateOptions,
  parseLocaleDateInput,
} from '../../src/frontend/lib/format-locale';

describe('locale date year omission', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses calendar dates as local midnights', () => {
    const date = parseLocaleDateInput('2026-07-21');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(21);
  });

  it('omits year in date options for the current year', () => {
    vi.setSystemTime(new Date(2026, 6, 21, 12, 0, 0));
    expect(localeDateOptions(new Date(2026, 2, 5))).toEqual({
      month: 'short',
      day: 'numeric',
    });
    expect(localeDateOptions(new Date(2025, 2, 5))).toEqual({
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  });

  it('formats current-year datetimes without a year token', async () => {
    vi.setSystemTime(new Date(2026, 6, 21, 12, 0, 0));
    await i18n.changeLanguage('en');
    const formatted = formatLocaleDateTime('2026-03-05T08:30:00');
    expect(formatted).toMatch(/Mar/);
    expect(formatted).toMatch(/5/);
    expect(formatted).not.toMatch(/2026/);

    const prior = formatLocaleDateTimeValue('2025-03-05T08:30:00');
    expect(prior).toMatch(/2025/);
  });

  it('formats current-year calendar and unix dates without a year', async () => {
    vi.setSystemTime(new Date(2026, 6, 21, 12, 0, 0));
    await i18n.changeLanguage('en');
    expect(formatLocaleCalendarDate('2026-07-21')).not.toMatch(/2026/);
    expect(formatLocaleCalendarDate('2025-07-21')).toMatch(/2025/);

    const currentUnix = Math.floor(new Date(2026, 0, 15).getTime() / 1000);
    const priorUnix = Math.floor(new Date(2024, 0, 15).getTime() / 1000);
    expect(formatLocaleDate(currentUnix)).not.toMatch(/2026/);
    expect(formatLocaleDate(priorUnix)).toMatch(/2024/);
  });
});
