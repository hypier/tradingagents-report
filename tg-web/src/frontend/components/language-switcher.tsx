import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import {
  type UiLocale,
  UI_LOCALES,
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
    <div
      className={cn('flex items-center gap-1', className)}
      role="group"
      aria-label={t('language.label')}
    >
      {UI_LOCALES.map((locale) => (
        <Button
          key={locale}
          type="button"
          size="sm"
          variant={active === locale ? 'secondary' : 'ghost'}
          className="h-7 px-2 text-xs"
          aria-pressed={active === locale}
          onClick={() => setLocale(locale)}
        >
          {t(`language.${locale}`)}
        </Button>
      ))}
    </div>
  );
}
