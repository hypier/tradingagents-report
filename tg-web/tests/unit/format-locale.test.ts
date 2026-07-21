import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from '../../src/frontend/i18n';
import { setDisplayTimezone } from '../../src/frontend/lib/display-timezone';
import {
  formatLocaleCalendarDate,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleDateTimeValue,
  localeDateOptions,
  parseLocaleDateInput,
  parseSortableDateInput,
} from '../../src/frontend/lib/format-locale';
import * as timezone from '../../src/shared/timezone';

describe('locale date year omission', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setDisplayTimezone(null);
  });

  it('parses calendar dates as local midnights', () => {
    const date = parseLocaleDateInput('2026-07-21');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(21);
  });

  it('parses calendar dates for sorting at UTC noon', () => {
    expect(parseSortableDateInput('2026-07-21')).toBe(
      Date.UTC(2026, 6, 21, 12, 0, 0),
    );
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

  it('formats instants in the account display timezone', async () => {
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    setDisplayTimezone('Asia/Shanghai');
    await i18n.changeLanguage('en');
    const formatted = formatLocaleDateTimeValue('2026-07-21T00:30:00.000Z');
    // 00:30 UTC → 08:30 in Shanghai
    expect(formatted).toMatch(/8:30|08:30/);
  });

  it('omits GMT offset when display timezone matches the browser', async () => {
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    vi.spyOn(timezone, 'guessBrowserTimezone').mockReturnValue('Asia/Shanghai');
    setDisplayTimezone('Asia/Shanghai');
    await i18n.changeLanguage('en');
    const formatted = formatLocaleDateTimeValue('2026-07-21T00:30:00.000Z');
    expect(formatted).toMatch(/8:30|08:30/);
    expect(formatted).not.toMatch(/GMT|UTC\+/);
  });

  it('keeps GMT offset when display timezone differs from the browser', async () => {
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    vi.spyOn(timezone, 'guessBrowserTimezone').mockReturnValue(
      'America/New_York',
    );
    setDisplayTimezone('Asia/Shanghai');
    await i18n.changeLanguage('en');
    const formatted = formatLocaleDateTimeValue('2026-07-21T00:30:00.000Z');
    expect(formatted).toMatch(/8:30|08:30/);
    expect(formatted).toMatch(/GMT\+8|UTC\+8/);
  });
});
