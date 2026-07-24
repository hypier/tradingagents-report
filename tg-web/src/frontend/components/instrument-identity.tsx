import type { ElementType, ReactNode } from 'react';

import { cn } from '@/frontend/lib/utils';

type Density = 'compact' | 'row' | 'header';

const nameStyles: Record<Density, string> = {
  compact: 'truncate text-sm font-normal tracking-tight text-foreground',
  row: 'truncate text-sm font-normal tracking-tight text-foreground',
  header: 'truncate text-xl font-semibold tracking-tight text-foreground',
};

const secondaryInlineStyles: Record<Density, string> = {
  compact: 'font-normal text-[11px] text-muted-foreground',
  row: 'font-normal text-xs text-muted-foreground',
  header: 'font-normal text-sm text-muted-foreground',
};

const tickerStyles: Record<Density, string> = {
  compact:
    'mt-0.5 block truncate font-mono text-[11px] tracking-wide text-muted-foreground',
  row: 'mt-0.5 block truncate font-mono text-xs tracking-wide text-muted-foreground',
  header: 'mt-1 font-mono text-sm tracking-wide text-muted-foreground',
};

/**
 * Canonical instrument label: company name on top, ticker code below.
 * When name is missing, ticker occupies the primary line only.
 * Optional `secondaryName` is appended inline after a localized title.
 */
export function InstrumentIdentity({
  name,
  ticker,
  density = 'row',
  nameAs: NameTag = 'p',
  className,
  nameClassName,
  tickerClassName,
  secondaryName,
  trailing,
  tickerSuffix,
  tickerTitle,
  onTickerClick,
  tickerAriaLabel,
}: {
  name?: string | null;
  ticker: string;
  density?: Density;
  nameAs?: ElementType;
  className?: string;
  nameClassName?: string;
  tickerClassName?: string;
  /** English / common name when primary `name` is localized. */
  secondaryName?: string | null;
  /** Badges / actions aligned with the name row (headers). */
  trailing?: ReactNode;
  /** Extra mono meta after the ticker (e.g. provider symbol). */
  tickerSuffix?: ReactNode;
  /** Full title for the ticker line when `tickerSuffix` is not a plain string. */
  tickerTitle?: string | null;
  /** When set, the ticker becomes a clickable control (e.g. copy). */
  onTickerClick?: () => void;
  tickerAriaLabel?: string;
}) {
  const code = ticker.trim();
  const normalizedName = name?.trim() || '';
  const normalizedSecondary = secondaryName?.trim() || '';
  const primary = normalizedName || code;
  const showSecondary =
    Boolean(normalizedSecondary) &&
    normalizedSecondary !== primary &&
    normalizedSecondary.toLowerCase() !== primary.toLowerCase();
  // Name on top; ticker below when we have a distinct name, or extra meta (provider).
  const showTickerLine =
    Boolean(code) &&
    ((Boolean(normalizedName) && normalizedName !== code) ||
      tickerSuffix != null ||
      onTickerClick != null);

  const tickerContent = (
    <>
      {code}
      {tickerSuffix ? (
        <span className="text-muted-foreground/80">{tickerSuffix}</span>
      ) : null}
    </>
  );
  const nameTitle = showSecondary
    ? `${primary} ${normalizedSecondary}`
    : primary;
  const resolvedTickerTitle =
    tickerTitle?.trim() ||
    (typeof tickerSuffix === 'string' || typeof tickerSuffix === 'number'
      ? `${code}${tickerSuffix}`
      : code);

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <NameTag
          className={cn(nameStyles[density], nameClassName)}
          title={nameTitle}
        >
          {primary}
          {showSecondary ? (
            <span className={cn('ml-1.5', secondaryInlineStyles[density])}>
              {normalizedSecondary}
            </span>
          ) : null}
        </NameTag>
        {trailing}
      </div>
      {showTickerLine ? (
        onTickerClick ? (
          <button
            type="button"
            onClick={onTickerClick}
            aria-label={tickerAriaLabel}
            title={tickerAriaLabel || resolvedTickerTitle}
            className={cn(
              tickerStyles[density],
              'cursor-pointer border-0 bg-transparent p-0 text-left underline underline-offset-2 transition-colors hover:text-foreground',
              tickerClassName,
            )}
          >
            {tickerContent}
          </button>
        ) : (
          <p
            className={cn(tickerStyles[density], tickerClassName)}
            title={resolvedTickerTitle}
          >
            {tickerContent}
          </p>
        )
      ) : null}
    </div>
  );
}
