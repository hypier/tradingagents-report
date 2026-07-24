import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { BrandMark } from '@/frontend/components/icons/research-icons';
import { Button } from '@/frontend/components/ui/button';

const SIGNAL_NODES = [
  [80, 300],
  [200, 240],
  [320, 270],
  [440, 160],
  [560, 190],
  [680, 95],
  [800, 130],
] as const;

/** Wireframe signal backdrop - Signal Floor instrument chrome. */
function FloorBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes welcome-signal-dash {
          to { stroke-dashoffset: -120; }
        }
        @keyframes welcome-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.35); }
        }
        @keyframes welcome-scan {
          0% { transform: translateX(-30%); opacity: 0; }
          15% { opacity: 0.55; }
          85% { opacity: 0.55; }
          100% { transform: translateX(130%); opacity: 0; }
        }
        .welcome-signal-dash {
          stroke-dasharray: 8 10;
          animation: welcome-signal-dash 14s linear infinite;
        }
        .welcome-node-pulse {
          transform-origin: center;
          transform-box: fill-box;
          animation: welcome-pulse 2.8s ease-in-out infinite;
        }
        .welcome-scan {
          animation: welcome-scan 7.5s ease-in-out infinite;
        }
      `}</style>

      <div
        className="absolute inset-0 opacity-[0.55] dark:opacity-[0.65]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage:
            'radial-gradient(ellipse at 50% 45%, black 22%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at 50% 45%, black 22%, transparent 78%)',
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_34%,rgba(217,119,6,0.18),rgba(217,119,6,0.05)_46%,transparent_70%)]" />
      <div className="absolute inset-y-0 left-0 w-1/4 bg-[linear-gradient(to_right,rgba(217,119,6,0.07),transparent)]" />
      <div className="absolute inset-y-0 right-0 w-1/4 bg-[linear-gradient(to_left,rgba(217,119,6,0.07),transparent)]" />

      <svg
        className="absolute top-[14%] left-1/2 h-[58%] w-[min(1100px,140%)] -translate-x-1/2 text-[#d97706]"
        viewBox="0 0 920 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {[
          [70, 48],
          [140, 72],
          [210, 40],
          [280, 96],
          [350, 58],
          [420, 110],
          [490, 68],
          [560, 124],
          [630, 82],
          [700, 140],
          [770, 96],
          [840, 118],
        ].map(([x, h]) => (
          <rect
            key={`bar-${x}`}
            x={x}
            y={340 - h}
            width="18"
            height={h}
            fill="currentColor"
            fillOpacity="0.05"
          />
        ))}

        <path
          d="M40 320 H180 V250 H300 V290 H420 V180 H540 V210 H660 V110 H780 V150 H880"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="1.25"
        />
        <path
          className="welcome-signal-dash"
          d="M60 310 L180 255 L300 275 L420 175 L540 195 L660 105 L800 135 L880 120"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M80 300 L200 240 L320 270 L440 160 L560 190 L680 95 L800 130"
          stroke="currentColor"
          strokeOpacity="0.38"
          strokeWidth="1.75"
          strokeLinejoin="miter"
          strokeLinecap="square"
        />

        {SIGNAL_NODES.map(([x, y], index) => (
          <rect
            key={`${x}-${y}`}
            className={
              index === SIGNAL_NODES.length - 1
                ? 'welcome-node-pulse'
                : undefined
            }
            x={x - 3}
            y={y - 3}
            width="6"
            height="6"
            fill="currentColor"
            fillOpacity={index === SIGNAL_NODES.length - 1 ? 0.7 : 0.4}
          />
        ))}
      </svg>

      <div className="welcome-scan absolute inset-y-[16%] left-0 w-24 bg-[linear-gradient(90deg,transparent,rgba(217,119,6,0.08),transparent)]" />
      <div className="absolute inset-x-0 top-[12%] h-px bg-gradient-to-r from-transparent via-[#d97706]/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-[16%] h-px bg-gradient-to-r from-transparent via-[#d97706]/20 to-transparent" />

      <span className="absolute top-5 left-5 h-6 w-6 border-t border-l border-[#d97706]/35" />
      <span className="absolute top-5 right-5 h-6 w-6 border-t border-r border-[#d97706]/35" />
      <span className="absolute bottom-8 left-5 h-6 w-6 border-b border-l border-[#d97706]/35" />
      <span className="absolute right-5 bottom-8 h-6 w-6 border-r border-b border-[#d97706]/35" />
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

/** Public landing page shown before authentication. */
export function WelcomePage() {
  const { t } = useTranslation(['welcome', 'common']);

  return (
    <main className="relative flex min-h-svh flex-col justify-center gap-5 overflow-hidden bg-background px-5 py-12 pb-16 lg:px-6 lg:py-16 lg:pb-20">
      <FloorBackdrop />

      <section className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-3 text-center sm:px-4">
        <div className="relative w-full border border-border/80 bg-background/55 px-8 py-10 backdrop-blur-[2px] sm:px-14 sm:py-12 dark:bg-card/40">
          <CornerMarks className="pointer-events-none absolute inset-0" />

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

          <div className="mt-10 flex items-center justify-center">
            <Button asChild size="lg">
              <Link to="/sign-in">{t('authAction')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <p className="absolute inset-x-0 bottom-5 text-center text-[11px] text-muted-foreground/80">
        {t('disclaimer')}
      </p>
    </main>
  );
}
