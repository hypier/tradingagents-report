import i18n from '@/frontend/i18n';
import { toIntlLocale } from '@/frontend/i18n/locales';

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

function isCurrentLocalYear(date: Date, now = new Date()) {
  return date.getFullYear() === now.getFullYear();
}

/** Date parts — omit year when the value falls in the current local year. */
export function localeDateOptions(
  date: Date,
  now = new Date(),
): Intl.DateTimeFormatOptions {
  if (isCurrentLocalYear(date, now)) {
    return { month: 'short', day: 'numeric' };
  }
  return { year: 'numeric', month: 'short', day: 'numeric' };
}

function localeDateTimeOptions(
  date: Date,
  now = new Date(),
): Intl.DateTimeFormatOptions {
  return {
    ...localeDateOptions(date, now),
    hour: '2-digit',
    minute: '2-digit',
  };
}

export function formatLocaleDateTime(value?: string | null, fallback = '') {
  if (!value) return fallback;
  const date = parseLocaleDateInput(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    localeDateTimeOptions(date),
  ).format(date);
}

export function formatLocaleNumber(value: number) {
  return value.toLocaleString(toIntlLocale(i18n.language));
}

export function formatLocaleDateTimeValue(value: string | number | Date) {
  const date = parseLocaleDateInput(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    localeDateTimeOptions(date),
  ).format(date);
}

export function formatLocaleTime(value?: string | null, fallback = '') {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parseLocaleDateInput(value));
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
    localeDateOptions(date),
  ).format(date);
}

/** Calendar / ISO date string → localized date; year omitted for the current year. */
export function formatLocaleCalendarDate(
  value?: string | null,
  fallback = '',
) {
  if (!value) return fallback;
  const date = parseLocaleDateInput(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(
    toIntlLocale(i18n.language),
    localeDateOptions(date),
  ).format(date);
}
