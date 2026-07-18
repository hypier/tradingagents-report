import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Minus,
  MoreVertical,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/lib/utils';

export const reportPaperThemes = [
  {
    id: 'ivory',
    swatch: '#fcfbf8',
    className: 'bg-[#fcfbf8]',
    highlight: '#efece4',
    highlightSoft: '#f5f2ea',
  },
  {
    id: 'white',
    swatch: '#ffffff',
    className: 'bg-white',
    highlight: '#eef0f3',
    highlightSoft: '#f5f6f8',
  },
  {
    id: 'linen',
    swatch: '#f5f1e8',
    className: 'bg-[#f5f1e8]',
    highlight: '#ebe3d4',
    highlightSoft: '#f0e9dc',
  },
  {
    id: 'mist',
    swatch: '#f3f6f8',
    className: 'bg-[#f3f6f8]',
    highlight: '#e4eaef',
    highlightSoft: '#ebf0f4',
  },
] as const;

export const reportDeskThemes = [
  {
    id: 'slate',
    swatch: '#e8ebef',
    className: 'bg-muted/45',
  },
  {
    id: 'stone',
    swatch: '#ebe7e1',
    className: 'bg-[#ebe7e1]/70',
  },
  {
    id: 'sage',
    swatch: '#e4ece6',
    className: 'bg-[#e4ece6]/80',
  },
  {
    id: 'sky',
    swatch: '#e5eef5',
    className: 'bg-[#e5eef5]/80',
  },
] as const;

export type ReportPaperThemeId = (typeof reportPaperThemes)[number]['id'];
export type ReportDeskThemeId = (typeof reportDeskThemes)[number]['id'];

type ReportReadingToolbarProps = {
  fontStep: number;
  fontSteps: readonly number[];
  onFontStepChange: (step: number) => void;
  paperTheme: ReportPaperThemeId;
  onPaperThemeChange: (theme: ReportPaperThemeId) => void;
  deskTheme: ReportDeskThemeId;
  onDeskThemeChange: (theme: ReportDeskThemeId) => void;
  showBackToTop: boolean;
  onBackToTop: () => void;
};

export function ReportReadingToolbar({
  fontStep,
  fontSteps,
  onFontStepChange,
  paperTheme,
  onPaperThemeChange,
  deskTheme,
  onDeskThemeChange,
  showBackToTop,
  onBackToTop,
}: ReportReadingToolbarProps) {
  const { t } = useTranslation('report');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="fixed right-6 bottom-6 z-30 flex flex-col-reverse items-end gap-2 md:right-8 md:bottom-8"
    >
      <Button
        type="button"
        size="icon"
        variant={open ? 'default' : 'outline'}
        aria-label={
          open ? t('reading.closeOptions') : t('reading.openOptions')
        }
        aria-expanded={open}
        className="size-11 rounded-full border bg-background/95 shadow-lg backdrop-blur-md"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="size-5" />
      </Button>

      <Button
        type="button"
        size="icon"
        aria-label={t('reading.backToTop')}
        onClick={onBackToTop}
        className={cn(
          'size-11 rounded-full shadow-lg transition-all duration-200',
          showBackToTop
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none absolute translate-y-2 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </Button>

      {open ? (
        <div className="w-56 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur-md">
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('reading.fontSize')}
              </p>
              <div className="flex items-center justify-between gap-1 rounded-xl bg-muted/50 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('reading.decreaseFont')}
                  disabled={fontStep <= 0}
                  className="rounded-lg"
                  onClick={() => onFontStepChange(Math.max(0, fontStep - 1))}
                >
                  <Minus />
                </Button>
                <span className="min-w-10 text-center font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(fontSteps[fontStep]! * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('reading.increaseFont')}
                  disabled={fontStep >= fontSteps.length - 1}
                  className="rounded-lg"
                  onClick={() =>
                    onFontStepChange(
                      Math.min(fontSteps.length - 1, fontStep + 1),
                    )
                  }
                >
                  <Plus />
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('reading.paper')}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {reportPaperThemes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    title={t(`reading.themes.${theme.id}`)}
                    aria-label={t('reading.paperColor', {
                      label: t(`reading.themes.${theme.id}`),
                    })}
                    aria-pressed={paperTheme === theme.id}
                    className={cn(
                      'relative flex size-9 items-center justify-center rounded-lg border shadow-sm transition-transform hover:scale-105',
                      paperTheme === theme.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'border-black/10',
                    )}
                    style={{ backgroundColor: theme.swatch }}
                    onClick={() => onPaperThemeChange(theme.id)}
                  >
                    {paperTheme === theme.id ? (
                      <Check className="size-3.5 text-foreground/70" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('reading.background')}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {reportDeskThemes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    title={t(`reading.themes.${theme.id}`)}
                    aria-label={t('reading.backgroundColor', {
                      label: t(`reading.themes.${theme.id}`),
                    })}
                    aria-pressed={deskTheme === theme.id}
                    className={cn(
                      'relative flex size-9 items-center justify-center rounded-lg border shadow-sm transition-transform hover:scale-105',
                      deskTheme === theme.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'border-black/10',
                    )}
                    style={{ backgroundColor: theme.swatch }}
                    onClick={() => onDeskThemeChange(theme.id)}
                  >
                    {deskTheme === theme.id ? (
                      <Check className="size-3.5 text-foreground/70" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
