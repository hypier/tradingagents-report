import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import {
  type UiLocale,
  UI_LOCALE_FLAGS,
  UI_LOCALES,
  isUiLocale,
  normalizeUiLocale,
  uiLocaleToInterfaceLanguage,
} from '@/frontend/i18n/locales';
import {
  getAccountProfile,
  updateAccountPreferences,
} from '@/frontend/lib/account';
import { cn } from '@/frontend/lib/utils';
import type { ProductMarketCode } from '@/shared/product-markets';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('common');
  const queryClient = useQueryClient();
  const active = normalizeUiLocale(i18n.language);

  async function setLocale(locale: UiLocale) {
    void i18n.changeLanguage(locale);
    try {
      const cached = queryClient.getQueryData<{
        data: {
          profile: {
            reportLanguage: string;
            timezone: string;
            defaultMarket: ProductMarketCode;
          };
        };
      }>(['account-profile']);
      const profile =
        cached?.data.profile ?? (await getAccountProfile()).data.profile;
      await updateAccountPreferences({
        interfaceLanguage: uiLocaleToInterfaceLanguage(locale),
        reportLanguage: profile.reportLanguage,
        timezone: profile.timezone,
        defaultMarket: profile.defaultMarket,
      });
      void queryClient.invalidateQueries({ queryKey: ['account-profile'] });
    } catch {
      // UI language already changed; account sync can retry on next visit.
    }
  }

  return (
    <Select
      value={active}
      onValueChange={(value) => {
        if (isUiLocale(value)) void setLocale(value);
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn(className)}
        aria-label={t('language.label')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" position="popper">
        <SelectGroup>
          {UI_LOCALES.map((locale) => (
            <SelectItem key={locale} value={locale}>
              <span aria-hidden="true">{UI_LOCALE_FLAGS[locale]}</span>
              {t(`language.${locale}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
