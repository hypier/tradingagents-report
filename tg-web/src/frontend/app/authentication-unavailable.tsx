import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { BrandMark } from '../components/icons/research-icons';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

export function AuthenticationUnavailable() {
  const { t } = useTranslation(['auth', 'common']);

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <section className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-10 text-primary" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl leading-none font-semibold tracking-[-0.02em]">
              <span>{t('common:brand.name')}</span>{' '}
              <span className="text-primary">{t('common:brand.floorTag')}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('common:brand.tagline')}
            </p>
          </div>
        </div>
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{t('auth:unavailable.title')}</AlertTitle>
          <AlertDescription>{t('auth:unavailable.body')}</AlertDescription>
        </Alert>
      </section>
    </main>
  );
}
