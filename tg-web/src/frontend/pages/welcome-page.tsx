import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { BrandMark } from '@/frontend/components/icons/research-icons';
import { PageBody } from '@/frontend/components/page-chrome';
import { Button } from '@/frontend/components/ui/button';

/** Signed-in landing: centered brand lockup and primary CTA. */
export function WelcomePage() {
  const { t } = useTranslation(['welcome', 'common']);

  return (
    <AppShell>
      <PageBody className="relative min-h-0 justify-center overflow-hidden py-12 pb-16 lg:py-16 lg:pb-20">
        {/* Signal Amber atmosphere (#d97706) — independent of light/admin primary tokens */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_24%,rgba(217,119,6,0.22),rgba(217,119,6,0.08)_48%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d97706]/40 to-transparent"
        />

        <section className="relative mx-auto flex w-full max-w-xl flex-col items-center px-2 text-center">
          <div className="flex flex-col items-center gap-5">
            <BrandMark className="size-16 text-[#d97706] sm:size-[4.5rem]" />

            <div className="space-y-2.5">
              <p className="font-mono text-[11px] tracking-[0.22em] text-[#d97706] uppercase">
                {t('common:brand.tagline')}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                <span className="text-foreground">
                  {t('common:brand.name')}
                </span>{' '}
                <span className="text-[#d97706]">
                  {t('common:brand.floorTag')}
                </span>
              </h1>
            </div>
          </div>

          <div
            aria-hidden
            className="mt-6 h-px w-16 bg-gradient-to-r from-transparent via-[#d97706]/60 to-transparent"
          />

          <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t('intro')}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button asChild size="lg">
                <Link to="/desk">{t('runAnalysis')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/quotes">{t('browseQuotes')}</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('hint')}</p>
          </div>
        </section>

        <p className="absolute inset-x-0 bottom-5 text-center text-[11px] text-muted-foreground/80">
          {t('disclaimer')}
        </p>
      </PageBody>
    </AppShell>
  );
}
