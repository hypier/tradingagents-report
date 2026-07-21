import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getAccountProfile } from '@/frontend/lib/account';
import { setDisplayTimezone } from '@/frontend/lib/display-timezone';
import {
  interfaceLanguageToUiLocale,
  normalizeUiLocale,
} from '@/frontend/i18n/locales';

/**
 * Hydrates the UI locale from the signed-in account profile once per session.
 * Local language switches still win after the user changes the switcher.
 * Display timezone tracks the account preference for all locale formatters.
 */
export function AccountLocaleSync() {
  const { i18n } = useTranslation();
  const appliedRef = useRef(false);
  const profile = useQuery({
    queryKey: ['account-profile'],
    queryFn: getAccountProfile,
  });

  useEffect(() => {
    const language = profile.data?.data.profile.interfaceLanguage;
    if (!language || appliedRef.current) return;
    const locale = interfaceLanguageToUiLocale(language);
    if (normalizeUiLocale(i18n.language) !== locale) {
      void i18n.changeLanguage(locale);
    }
    appliedRef.current = true;
  }, [i18n, profile.data?.data.profile.interfaceLanguage]);

  useEffect(() => {
    setDisplayTimezone(profile.data?.data.profile.timezone);
  }, [profile.data?.data.profile.timezone]);

  return null;
}
