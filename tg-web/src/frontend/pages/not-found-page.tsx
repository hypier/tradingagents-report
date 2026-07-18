import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation('common');

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold text-foreground">
        {t('notFound.title')}
      </h1>
    </main>
  );
}
