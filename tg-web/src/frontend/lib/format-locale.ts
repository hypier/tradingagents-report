import i18n from '@/frontend/i18n';
import { toIntlLocale } from '@/frontend/i18n/locales';

export function formatLocaleDateTime(value?: string | null, fallback = '') {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatLocaleNumber(value: number) {
  return value.toLocaleString(toIntlLocale(i18n.language));
}

export function formatLocaleDateTimeValue(value: string | number | Date) {
  return new Date(value).toLocaleString(toIntlLocale(i18n.language));
}

export function formatLocaleTime(value?: string | null, fallback = '') {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
