import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Minus,
  MoreVertical,
  Plus,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/lib/utils';

export const reportPaperThemes = [
  {
    id: 'ivory',
    swatch: '#fcfbf8',
    // Warm charcoal — default night reading surface.
    darkSwatch: '#3a342c',
    className: 'bg-[#fcfbf8] dark:bg-[#3a342c]',
    highlight: '#efece4',
    highlightSoft: '#f5f2ea',
    darkHighlight: '#524a3e',
    darkHighlightSoft: '#453e34',
  },
  {
    id: 'white',
    swatch: '#ffffff',
    // Neutral elevated gray.
    darkSwatch: '#2f2f33',
    className: 'bg-white dark:bg-[#2f2f33]',
    highlight: '#eef0f3',
    highlightSoft: '#f5f6f8',
    darkHighlight: '#45454b',
    darkHighlightSoft: '#3a3a40',
  },
  {
    id: 'linen',
    swatch: '#f5f1e8',
    // Sepia / amber paper for lower blue light.
    darkSwatch: '#4a3824',
    className: 'bg-[#f5f1e8] dark:bg-[#4a3824]',
    highlight: '#ebe3d4',
    highlightSoft: '#f0e9dc',
    darkHighlight: '#655032',
    darkHighlightSoft: '#57442b',
  },
  {
    id: 'mist',
    swatch: '#f3f6f8',
    // Cool steel-blue paper.
    darkSwatch: '#2a3a4a',
    className: 'bg-[#f3f6f8] dark:bg-[#2a3a4a]',
    highlight: '#e4eaef',
    highlightSoft: '#ebf0f4',
    darkHighlight: '#3d5368',
    darkHighlightSoft: '#334859',
  },
] as const;

export const reportDeskThemes = [
  {
    id: 'slate',
    swatch: '#e8ebef',
    darkSwatch: '#1c222b',
    className: 'bg-muted/45 dark:bg-[#1c222b]',
  },
  {
    id: 'stone',
    swatch: '#ebe7e1',
    darkSwatch: '#2a2218',
    className: 'bg-[#ebe7e1]/70 dark:bg-[#2a2218]',
  },
  {
    id: 'sage',
    swatch: '#e4ece6',
    darkSwatch: '#1a2820',
    className: 'bg-[#e4ece6]/80 dark:bg-[#1a2820]',
  },
  {
    id: 'sky',
    swatch: '#e5eef5',
    darkSwatch: '#152433',
    className: 'bg-[#e5eef5]/80 dark:bg-[#152433]',
  },
] as const;

export type ReportPaperThemeId = (typeof reportPaperThemes)[number]['id'];
export type ReportDeskThemeId = (typeof reportDeskThemes)[number]['id'];

const VIEWPORT_EDGE_PAD = 24;
/** Gap between the paper's right edge and the floating control column. */
const PAPER_EDGE_GUTTER = 30;
/** Matches `size-11` control width so the stack sits fully outside the paper. */
const CONTROL_SIZE = 44;

function getActiveReportPaper() {
  return (
    document.querySelector<HTMLElement>(
      '[data-slot="tabs-content"][data-state="active"] [data-report-paper]',
    ) ?? document.querySelector<HTMLElement>('[data-report-paper]')
  );
}

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
  /** Remeasure paper edge when the active report section changes. */
  layoutKey?: string;
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
  layoutKey,
}: ReportReadingToolbarProps) {
  const { t } = useTranslation('report');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [open, setOpen] = useState(false);
  const [offsetRight, setOffsetRight] = useState(VIEWPORT_EDGE_PAD);
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

  useEffect(() => {
    function updateOffset() {
      const paper = getActiveReportPaper();
      if (!paper) {
        setOffsetRight(VIEWPORT_EDGE_PAD);
        return;
      }
      const fromViewportRight =
        window.innerWidth - paper.getBoundingClientRect().right;
      // Sit in the desk gutter just outside the paper's right edge.
      setOffsetRight(
        Math.max(
          VIEWPORT_EDGE_PAD,
          fromViewportRight - PAPER_EDGE_GUTTER - CONTROL_SIZE,
        ),
      );
    }

    updateOffset();
    window.addEventListener('resize', updateOffset);
    const paper = getActiveReportPaper();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && paper
        ? new ResizeObserver(updateOffset)
        : null;
    if (paper) resizeObserver?.observe(paper);
    // Reposition after layout/tab changes settle.
    const raf = window.requestAnimationFrame(updateOffset);

    return () => {
      window.removeEventListener('resize', updateOffset);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [deskTheme, layoutKey, paperTheme, showBackToTop]);

  return (
    <div
      ref={rootRef}
      className="fixed bottom-6 z-30 flex flex-col-reverse items-end gap-2 md:bottom-8"
      style={{ right: offsetRight }}
    >
      <Button
        type="button"
        size="icon"
        variant={open ? 'default' : 'outline'}
        aria-label={
          open ? t('reading.closeOptions') : t('reading.openOptions')
        }
        aria-expanded={open}
        className="size-11 rounded-none border border-border bg-background/95 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="size-5" />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={t('reading.backToTop')}
        onClick={onBackToTop}
        className={cn(
          'size-11 rounded-none border border-border bg-background/95 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition-opacity duration-200',
          showBackToTop
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none absolute opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </Button>

      {open ? (
        <div className="w-56 rounded-none border border-border bg-background/95 p-3 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('reading.fontSize')}
              </p>
              <div className="flex items-center justify-between gap-1 border border-border bg-muted/50 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('reading.decreaseFont')}
                  disabled={fontStep <= 0}
                  className="rounded-none"
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
                  className="rounded-none"
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
                      'relative flex size-9 cursor-pointer items-center justify-center rounded-none border transition-colors',
                      paperTheme === theme.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-popover'
                        : 'border-black/10 dark:border-white/30',
                    )}
                    style={{
                      backgroundColor: isDark
                        ? theme.darkSwatch
                        : theme.swatch,
                    }}
                    onClick={() => onPaperThemeChange(theme.id)}
                  >
                    {paperTheme === theme.id ? (
                      <Check
                        className={cn(
                          'size-3.5',
                          isDark ? 'text-white/90' : 'text-foreground/70',
                        )}
                      />
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
                      'relative flex size-9 cursor-pointer items-center justify-center rounded-none border transition-colors',
                      deskTheme === theme.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-popover'
                        : 'border-black/10 dark:border-white/30',
                    )}
                    style={{
                      backgroundColor: isDark
                        ? theme.darkSwatch
                        : theme.swatch,
                    }}
                    onClick={() => onDeskThemeChange(theme.id)}
                  >
                    {deskTheme === theme.id ? (
                      <Check
                        className={cn(
                          'size-3.5',
                          isDark ? 'text-white/90' : 'text-foreground/70',
                        )}
                      />
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
