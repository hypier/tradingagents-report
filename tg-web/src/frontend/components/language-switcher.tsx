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
} from '@/frontend/i18n/locales';
import { cn } from '@/frontend/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('common');
  const active = normalizeUiLocale(i18n.language);

  function setLocale(locale: UiLocale) {
    void i18n.changeLanguage(locale);
  }

  return (
    <Select
      value={active}
      onValueChange={(value) => {
        if (isUiLocale(value)) setLocale(value);
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
