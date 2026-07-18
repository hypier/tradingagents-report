export const UI_LOCALES = ['en', 'zh'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = 'en';

export const UI_LANGUAGE_STORAGE_KEY = 'tg-web.ui-language';

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  en: 'English',
  zh: '中文',
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

export function toIntlLocale(locale: string): string {
  return normalizeUiLocale(locale) === 'zh' ? 'zh-CN' : 'en-US';
}

export function syncDocumentLang(locale: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = normalizeUiLocale(locale);
}
