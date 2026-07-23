import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { BrandMark } from '@/frontend/components/icons/research-icons';
import { PageBody } from '@/frontend/components/page-chrome';
import { Button } from '@/frontend/components/ui/button';

/** Wireframe signal backdrop — Signal Floor instrument chrome. */
function FloorBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Ledger grid */}
      <div
        className="absolute inset-0 opacity-[0.45] dark:opacity-[0.55]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(148,163,184,0.10) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148,163,184,0.10) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse at 50% 42%, black 18%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at 50% 42%, black 18%, transparent 72%)',
        }}
      />

      {/* Soft amber pit wash — restrained */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_36%,rgba(217,119,6,0.12),transparent_62%)]" />

      {/* Ascending research signal */}
      <svg
        className="absolute top-[18%] left-1/2 h-[52%] w-[min(920px,120%)] -translate-x-1/2 text-[#d97706]"
        viewBox="0 0 920 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M40 320 H180 V250 H300 V290 H420 V180 H540 V210 H660 V110 H780 V150 H880"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="1.25"
        />
        <path
          d="M80 300 L200 240 L320 270 L440 160 L560 190 L680 95 L800 130"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="1.5"
          strokeLinejoin="miter"
          strokeLinecap="square"
        />
        {[
          [80, 300],
          [200, 240],
          [320, 270],
          [440, 160],
          [560, 190],
          [680, 95],
          [800, 130],
        ].map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x - 2.5}
            y={y - 2.5}
            width="5"
            height="5"
            fill="currentColor"
            fillOpacity="0.35"
          />
        ))}
      </svg>

      {/* Horizontal floor rules */}
      <div className="absolute inset-x-0 top-[14%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute inset-x-0 bottom-[18%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

function CornerMarks({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <span className="absolute top-0 left-0 h-4 w-4 border-t border-l border-[#d97706]/55" />
      <span className="absolute top-0 right-0 h-4 w-4 border-t border-r border-[#d97706]/55" />
      <span className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-[#d97706]/55" />
      <span className="absolute right-0 bottom-0 h-4 w-4 border-r border-b border-[#d97706]/55" />
    </div>
  );
}

/** Signed-in landing: centered brand lockup and primary CTA. */
export function WelcomePage() {
  const { t } = useTranslation(['welcome', 'common']);

  return (
    <AppShell>
      <PageBody className="relative min-h-0 justify-center overflow-hidden py-12 pb-16 lg:py-16 lg:pb-20">
        <FloorBackdrop />

        <section className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-3 text-center sm:px-4">
          <div className="relative w-full border border-border/80 bg-background/55 px-8 py-10 backdrop-blur-[2px] sm:px-14 sm:py-12 dark:bg-card/40">
            <CornerMarks className="absolute inset-0" />

            <div className="flex flex-col items-center gap-6">
              <BrandMark className="size-24 text-[#d97706] sm:size-28" />

              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] text-[#d97706] uppercase">
                  <span aria-hidden className="size-1.5 bg-[#d97706]" />
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
              className="mx-auto mt-8 h-px w-20 bg-gradient-to-r from-transparent via-[#d97706]/65 to-transparent"
            />

            <p className="mx-auto mt-8 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-7">
              {t('intro')}
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/desk">{t('runAnalysis')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/quotes">{t('browseQuotes')}</Link>
              </Button>
            </div>
          </div>
        </section>

        <p className="absolute inset-x-0 bottom-5 text-center text-[11px] text-muted-foreground/80">
          {t('disclaimer')}
        </p>
      </PageBody>
    </AppShell>
  );
}
