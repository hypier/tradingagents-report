export const UI_THEMES = ['light', 'dark', 'system'] as const;

export type UiTheme = (typeof UI_THEMES)[number];

export const DEFAULT_UI_THEME: UiTheme = 'system';

export const UI_THEME_STORAGE_KEY = 'tg-web.theme';

export function isUiTheme(value: string): value is UiTheme {
  return (UI_THEMES as readonly string[]).includes(value);
}

export function normalizeUiTheme(value?: string | null): UiTheme {
  if (!value) return DEFAULT_UI_THEME;
  return isUiTheme(value) ? value : DEFAULT_UI_THEME;
}
