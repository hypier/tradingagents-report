import { CircleAlert, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

export function AuthenticationUnavailable() {
  const { t } = useTranslation('auth');

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <section className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t('brand')}</h1>
        </div>
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{t('unavailable.title')}</AlertTitle>
          <AlertDescription>{t('unavailable.body')}</AlertDescription>
        </Alert>
      </section>
    </main>
  );
}
