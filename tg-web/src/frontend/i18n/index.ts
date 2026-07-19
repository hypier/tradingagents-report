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
import enAuth from './locales/en/auth.json';
import enAccount from './locales/en/account.json';
import enBilling from './locales/en/billing.json';
import enAdmin from './locales/en/admin.json';
import enLegal from './locales/en/legal.json';
import zhCommon from './locales/zh/common.json';
import zhHome from './locales/zh/home.json';
import zhReports from './locales/zh/reports.json';
import zhReport from './locales/zh/report.json';
import zhSearch from './locales/zh/search.json';
import zhAuth from './locales/zh/auth.json';
import zhAccount from './locales/zh/account.json';
import zhBilling from './locales/zh/billing.json';
import zhAdmin from './locales/zh/admin.json';
import zhLegal from './locales/zh/legal.json';

export const i18nNamespaces = [
  'common',
  'home',
  'reports',
  'report',
  'search',
  'auth',
  'account',
  'billing',
  'admin',
  'legal',
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
        auth: enAuth,
        account: enAccount,
        billing: enBilling,
        admin: enAdmin,
        legal: enLegal,
      },
      zh: {
        common: zhCommon,
        home: zhHome,
        reports: zhReports,
        report: zhReport,
        search: zhSearch,
        auth: zhAuth,
        account: zhAccount,
        billing: zhBilling,
        admin: zhAdmin,
        legal: zhLegal,
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
