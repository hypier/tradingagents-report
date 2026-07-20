import type { InterfaceLanguage } from '@/backend/account/contract';

export const UI_LOCALES = ['en', 'zh'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = 'en';

export const UI_LANGUAGE_STORAGE_KEY = 'tg-web.ui-language';

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  en: 'English',
  zh: '中文',
};

/** Regional flag emoji shown next to each UI language option. */
export const UI_LOCALE_FLAGS: Record<UiLocale, string> = {
  en: '🇺🇸',
  zh: '🇨🇳',
};

export function isUiLocale(value: string): value is UiLocale {
  return (UI_LOCALES as readonly string[]).includes(value);
}

export function normalizeUiLocale(value?: string | null): UiLocale {
  if (!value) return DEFAULT_UI_LOCALE;
  const lower = value.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return DEFAULT_UI_LOCALE;
}

export function uiLocaleToInterfaceLanguage(
  locale: UiLocale,
): InterfaceLanguage {
  return locale === 'zh' ? 'zh-CN' : 'en';
}

export function interfaceLanguageToUiLocale(
  language?: string | null,
): UiLocale {
  return normalizeUiLocale(language);
}

export function toIntlLocale(locale: string): string {
  return normalizeUiLocale(locale) === 'zh' ? 'zh-CN' : 'en-US';
}

export function syncDocumentLang(locale: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = normalizeUiLocale(locale);
}

/** Calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function todayInTimezone(timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
