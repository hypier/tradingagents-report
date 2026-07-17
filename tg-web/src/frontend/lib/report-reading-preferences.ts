import {
  reportDeskThemes,
  reportPaperThemes,
  type ReportDeskThemeId,
  type ReportPaperThemeId,
} from '@/frontend/components/report/report-reading-toolbar';

const STORAGE_KEY = 'tg-web.report-reading-preferences';

export type ReportReadingPreferences = {
  fontStep: number;
  paperTheme: ReportPaperThemeId;
  deskTheme: ReportDeskThemeId;
};

const paperThemeIds = new Set(
  reportPaperThemes.map((theme) => theme.id),
);
const deskThemeIds = new Set(reportDeskThemes.map((theme) => theme.id));

export function loadReportReadingPreferences(
  defaults: ReportReadingPreferences,
): ReportReadingPreferences {
  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<ReportReadingPreferences>;
    const fontStep =
      typeof parsed.fontStep === 'number' && Number.isFinite(parsed.fontStep)
        ? Math.trunc(parsed.fontStep)
        : defaults.fontStep;
    const paperTheme =
      typeof parsed.paperTheme === 'string' &&
      paperThemeIds.has(parsed.paperTheme as ReportPaperThemeId)
        ? (parsed.paperTheme as ReportPaperThemeId)
        : defaults.paperTheme;
    const deskTheme =
      typeof parsed.deskTheme === 'string' &&
      deskThemeIds.has(parsed.deskTheme as ReportDeskThemeId)
        ? (parsed.deskTheme as ReportDeskThemeId)
        : defaults.deskTheme;

    return { fontStep, paperTheme, deskTheme };
  } catch {
    return defaults;
  }
}

export function saveReportReadingPreferences(
  preferences: ReportReadingPreferences,
) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}
