import i18n from '@/frontend/i18n';
import { toIntlLocale } from '@/frontend/i18n/locales';
import { getDisplayTimezone } from '@/frontend/lib/display-timezone';
import { guessBrowserTimezone } from '@/shared/timezone';

/** Parse ISO timestamps, unix ms/s via Date, and calendar `YYYY-MM-DD` as local dates. */
export function parseLocaleDateInput(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (calendar) {
    return new Date(
      Number(calendar[1]),
      Number(calendar[2]) - 1,
      Number(calendar[3]),
    );
  }
  return new Date(value);
}

/**
 * Stable ms for calendar `YYYY-MM-DD` (UTC noon) or instant strings.
 * Avoids `new Date('YYYY-MM-DD')` UTC-midnight skew vs local display.
 */
export function parseSortableDateInput(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value).trim());
  if (calendar) {
    return Date.UTC(
      Number(calendar[1]),
      Number(calendar[2]) - 1,
      Number(calendar[3]),
      12,
      0,
      0,
    );
  }
  return parseLocaleDateInput(value).getTime();
}

function zonedDateParts(date: Date, timeZone?: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
  };
}

function isCurrentDisplayYear(date: Date, now = new Date()) {
  const zone = getDisplayTimezone();
  return zonedDateParts(date, zone).year === zonedDateParts(now, zone).year;
}

/** True when `date` falls on "today" in the display timezone (browser if unset). */
export function isDisplayToday(date: Date, now = new Date()) {
  const zone = getDisplayTimezone();
  const left = zonedDateParts(date, zone);
  const right = zonedDateParts(now, zone);
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day
  );
}

/** Date parts — omit year when the value falls in the current display year. */
export function localeDateOptions(
  date: Date,
  now = new Date(),
): Intl.DateTimeFormatOptions {
  if (isCurrentDisplayYear(date, now)) {
    return { month: 'short', day: 'numeric' };
  }
  return { year: 'numeric', month: 'short', day: 'numeric' };
}

function normalizeTimezoneId(zone: string): string {
  if (zone === 'Etc/UTC' || zone === 'Etc/GMT') return 'UTC';
  return zone;
}

/** Show GMT/UTC offset only when display TZ differs from the device TZ. */
function shouldShowTimeZoneOffset(): boolean {
  const display = getDisplayTimezone();
  if (!display) return false;
  return (
    normalizeTimezoneId(display) !==
    normalizeTimezoneId(guessBrowserTimezone())
  );
}

function localeDateTimeOptions(
  date: Date,
  now = new Date(),
): Intl.DateTimeFormatOptions {
  const options: Intl.DateTimeFormatOptions = {
    ...localeDateOptions(date, now),
    hour: '2-digit',
    minute: '2-digit',
  };
  if (shouldShowTimeZoneOffset()) {
    options.timeZoneName = 'shortOffset';
  }
  return options;
}

function withDisplayTimeZone(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  const timeZone = getDisplayTimezone();
  return timeZone ? { ...options, timeZone } : options;
}

export function formatLocaleDateTime(value?: string | null, fallback = '') {
  if (!value) return fallback;
  const date = parseLocaleDateInput(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    withDisplayTimeZone(localeDateTimeOptions(date)),
  ).format(date);
}

export function formatLocaleNumber(value: number) {
  return value.toLocaleString(toIntlLocale(i18n.language));
}

/** Trim fixed-scale decimals (e.g. DB numeric `5.00000000` → `5`). */
export function formatTrimmedDecimal(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  if (value == null || value === '') return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  return String(num);
}

/** Display LLM catalog prices with a dollar sign (e.g. `$5`, `$1.25`). */
export function formatUsdPrice(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  const trimmed = formatTrimmedDecimal(value, '');
  if (!trimmed) return fallback;
  return `$${trimmed}`;
}

/** Compact notation (e.g. 1.2M / 1.2亿) following the active UI locale. */
export function formatLocaleCompactNumber(
  value?: number,
  fallback = '—',
) {
  if (value === undefined) return fallback;
  return new Intl.NumberFormat(toIntlLocale(i18n.language), {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatLocaleDateTimeValue(value: string | number | Date) {
  const date = parseLocaleDateInput(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    withDisplayTimeZone(localeDateTimeOptions(date)),
  ).format(date);
}

export function formatLocaleTime(value?: string | null, fallback = '') {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    withDisplayTimeZone({
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
  ).format(parseLocaleDateInput(value));
}

export function formatLocaleCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(toIntlLocale(i18n.language), {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/** Unix seconds → localized date; year omitted for the current year. */
export function formatLocaleDate(
  timestamp: number | null,
  fallback = '',
) {
  if (timestamp === null) return fallback;
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    withDisplayTimeZone(localeDateOptions(date)),
  ).format(date);
}

/**
 * Calendar / ISO date string → localized date (no timezone shift).
 * Year omitted for the current display-timezone year.
 */
export function formatLocaleCalendarDate(
  value?: string | null,
  fallback = '',
) {
  if (!value) return fallback;
  const trimmed = value.trim();
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    // Noon UTC keeps the calendar day stable under Intl formatting.
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const displayYear = zonedDateParts(new Date(), getDisplayTimezone()).year;
    const options: Intl.DateTimeFormatOptions =
      year === displayYear
        ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
        : {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          };
    return new Intl.DateTimeFormat(
      toIntlLocale(i18n.language),
      options,
    ).format(date);
  }
  const date = parseLocaleDateInput(trimmed);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    withDisplayTimeZone(localeDateOptions(date)),
  ).format(date);
}
