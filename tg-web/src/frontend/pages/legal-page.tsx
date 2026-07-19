import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { Button } from '@/frontend/components/ui/button';

const documentKeys = ['risk-disclaimer', 'terms', 'privacy'] as const;

type LegalDocumentKey = (typeof documentKeys)[number];

function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return (documentKeys as readonly string[]).includes(value);
}

export function LegalPage({ publicView = false }: { publicView?: boolean }) {
  const { t } = useTranslation('legal');
  const { document = 'terms' } = useParams();
  const documentKey = isLegalDocumentKey(document) ? document : 'terms';
  const title = t(`documents.${documentKey}.title`);
  const paragraphs = t(`documents.${documentKey}.paragraphs`, {
    returnObjects: true,
  }) as string[];

  const body = (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t('effective')}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>
      <div className="flex flex-col gap-4 text-sm leading-6">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <Button asChild variant="outline" className="self-start">
        <Link to={publicView ? '/' : '/account'}>{t('back')}</Link>
      </Button>
    </main>
  );
  return publicView ? body : <AppShell title={title}>{body}</AppShell>;
}
