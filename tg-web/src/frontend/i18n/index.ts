import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import {
  DEFAULT_UI_LOCALE,
  UI_LANGUAGE_STORAGE_KEY,
  normalizeUiLocale,
  syncDocumentLang,
} from './locales';

import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import enReports from './locales/en/reports.json';
import enReport from './locales/en/report.json';
import enSearch from './locales/en/search.json';
import zhCommon from './locales/zh/common.json';
import zhHome from './locales/zh/home.json';
import zhReports from './locales/zh/reports.json';
import zhReport from './locales/zh/report.json';
import zhSearch from './locales/zh/search.json';

export const i18nNamespaces = [
  'common',
  'home',
  'reports',
  'report',
  'search',
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        home: enHome,
        reports: enReports,
        report: enReport,
        search: enSearch,
      },
      zh: {
        common: zhCommon,
        home: zhHome,
        reports: zhReports,
        report: zhReport,
        search: zhSearch,
      },
    },
    fallbackLng: DEFAULT_UI_LOCALE,
    supportedLngs: ['en', 'zh'],
    nonExplicitSupportedLngs: true,
    defaultNS: 'common',
    ns: [...i18nNamespaces],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: UI_LANGUAGE_STORAGE_KEY,
      convertDetectedLanguage: (lng) => normalizeUiLocale(lng),
    },
  })
  .then(() => {
    syncDocumentLang(i18n.language);
  });

i18n.on('languageChanged', (lng) => {
  syncDocumentLang(lng);
});

export default i18n;
