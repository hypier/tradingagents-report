import { Avatar, AvatarFallback, AvatarImage } from '@/frontend/components/ui/avatar';
import { cn } from '@/frontend/lib/utils';

const SIZE_STYLES = {
  /** Ticker tape chip */
  xs: { root: 'size-5', fallback: 'text-[10px] leading-none' },
  /** Compact group headers */
  sm: { root: 'size-7', fallback: 'text-[11px]' },
  /** Canonical row mark — DESIGN 28×28 */
  md: { root: 'size-8', fallback: 'text-xs' },
  /** Search hits / quote strip */
  lg: { root: 'size-10', fallback: 'text-sm' },
  /** Report headers (~44px) */
  xl: { root: 'size-11', fallback: 'text-sm' },
  /** Quote strip panel */
  '2xl': { root: 'size-14', fallback: 'text-sm' },
  /** Stock detail header */
  '3xl': { root: 'size-16', fallback: 'text-xl' },
} as const;

export type InstrumentLogoSize = keyof typeof SIZE_STYLES;

function fallbackLetter(symbol: string) {
  const trimmed = symbol.trim();
  if (!trimmed) return '?';
  const label = trimmed.includes(':') ? trimmed.split(':', 2)[1]! : trimmed;
  return (label.trim() || trimmed).slice(0, 1).toUpperCase();
}

/**
 * Square instrument mark (never circular). Prefer this over raw Avatar for tickers.
 */
export function InstrumentLogo({
  symbol,
  logoUrl,
  alt,
  size = 'md',
  tone = 'muted',
  className,
}: {
  /** Ticker or EXCHANGE:SYMBOL — drives fallback letter. */
  symbol: string;
  logoUrl?: string | null;
  alt?: string;
  size?: InstrumentLogoSize;
  /** `accent` for report headers with primary wash. */
  tone?: 'muted' | 'accent';
  className?: string;
}) {
  const styles = SIZE_STYLES[size];
  const src = logoUrl?.trim() || undefined;

  return (
    <Avatar
      className={cn(
        'shrink-0 !rounded-none after:hidden',
        styles.root,
        className,
      )}
      data-logo-url={src}
    >
      <AvatarImage
        key={src ?? 'missing'}
        src={src}
        alt={alt ?? ''}
        className="!rounded-none object-contain"
      />
      <AvatarFallback
        className={cn(
          '!rounded-none font-semibold',
          styles.fallback,
          tone === 'accent'
            ? 'bg-primary/10 text-primary ring-1 ring-primary/15'
            : 'bg-muted text-foreground',
        )}
      >
        {fallbackLetter(symbol)}
      </AvatarFallback>
    </Avatar>
  );
}
