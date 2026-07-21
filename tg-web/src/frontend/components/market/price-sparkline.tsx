import { cn } from '@/frontend/lib/utils';

type PriceSparklineProps = {
  values: number[];
  className?: string;
  /** ViewBox width; rendered size via className. */
  width?: number;
  height?: number;
};

/**
 * Compact close-price polyline for dense rows.
 * Stroke uses Rise/Fall from first→last; dim steel when flat.
 */
export function PriceSparkline({
  values,
  className,
  width = 72,
  height = 28,
}: PriceSparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 1;
  const padY = 2;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = last - first;

  const points = values
    .map((value, index) => {
      const x =
        padX + (index / (values.length - 1)) * (width - padX * 2);
      const y =
        padY + (1 - (value - min) / span) * (height - padY * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        'h-7 w-[4.5rem] shrink-0',
        delta > 0 && 'text-market-up',
        delta < 0 && 'text-market-down',
        delta === 0 && 'text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
