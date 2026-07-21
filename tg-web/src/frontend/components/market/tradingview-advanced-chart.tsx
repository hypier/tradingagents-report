import { useQuery } from '@tanstack/react-query';
import { CandlestickChart, ChartLine } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import {
  getMarketOhlcv,
  type MarketOhlcvBar,
} from '@/frontend/lib/research';
import { cn } from '@/frontend/lib/utils';

/** Chart interval codes aligned with TradingView RapidAPI timeframes. */
export const CHART_INTERVALS = [
  { value: '5', labelKey: '5m', range: 156 },
  { value: '15', labelKey: '15m', range: 160 },
  { value: '30', labelKey: '30m', range: 140 },
  { value: '60', labelKey: '1H', range: 120 },
  { value: 'D', labelKey: '1D', range: 180 },
  { value: 'W', labelKey: '1W', range: 104 },
  { value: 'M', labelKey: '1M', range: 60 },
] as const;

export type ChartInterval = (typeof CHART_INTERVALS)[number]['value'];
export type ChartStyle = 'candle' | 'line';

const DEFAULT_INTERVAL: ChartInterval = 'D';
const MA_PERIODS = [
  { key: 'ma5', period: 5, color: '#D97706', label: 'MA5' },
  { key: 'ma10', period: 10, color: '#38BDF8', label: 'MA10' },
  { key: 'ma20', period: 20, color: '#94A3B8', label: 'MA20' },
] as const;

type MaKey = (typeof MA_PERIODS)[number]['key'];

type MaVisibility = Record<MaKey, boolean>;

const DEFAULT_MA_VISIBLE: MaVisibility = {
  ma5: true,
  ma10: true,
  ma20: true,
};

type ChartColors = {
  background: string;
  text: string;
  grid: string;
  rise: string;
  fall: string;
  accent: string;
  crosshair: string;
  labelBg: string;
  line: string;
};

type LegendState = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
};

type LinePoint = { time: UTCTimestamp; value: number };

function readCssColor(variable: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function withAlpha(color: string, alphaHex: string) {
  return /^#[0-9a-fA-F]{6}$/u.test(color) ? `${color}${alphaHex}` : color;
}

function chartColors(isDark: boolean): ChartColors {
  return {
    background: readCssColor('--card', isDark ? '#0E141B' : '#ffffff'),
    text: readCssColor('--muted-foreground', isDark ? '#78879B' : '#3F4B5B'),
    grid: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)',
    rise: readCssColor('--chart-2', '#22C55E'),
    fall: readCssColor('--chart-3', '#F43F5E'),
    accent: readCssColor('--chart-1', '#D97706'),
    crosshair: isDark ? 'rgba(217,119,6,0.55)' : 'rgba(217,119,6,0.45)',
    labelBg: isDark ? '#151C25' : '#0F172A',
    line: isDark ? '#F1F5F9' : '#0F172A',
  };
}

function formatVolume(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatPrice(value: number) {
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function intervalStepSeconds(interval: ChartInterval): number | null {
  if (interval === '5') return 300;
  if (interval === '15') return 900;
  if (interval === '30') return 1_800;
  if (interval === '60') return 3600;
  return null;
}

function applyLivePrice(
  bars: MarketOhlcvBar[],
  price: number,
  asOfUnix: number,
  interval: ChartInterval,
): MarketOhlcvBar[] {
  if (!bars.length || !Number.isFinite(price)) return bars;
  const last = bars[bars.length - 1]!;
  const step = intervalStepSeconds(interval);

  const bump = (bar: MarketOhlcvBar): MarketOhlcvBar => ({
    ...bar,
    high: Math.max(bar.high, price),
    low: Math.min(bar.low, price),
    close: price,
  });

  if (step === null) {
    return [...bars.slice(0, -1), bump(last)];
  }

  const bucket = Math.floor(asOfUnix / step) * step;
  if (bucket === last.time) {
    return [...bars.slice(0, -1), bump(last)];
  }
  if (bucket > last.time) {
    return [
      ...bars,
      {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      },
    ];
  }
  return [...bars.slice(0, -1), bump(last)];
}

function sma(bars: MarketOhlcvBar[], period: number): LinePoint[] {
  if (bars.length < period) return [];
  const points: LinePoint[] = [];
  let sum = 0;
  for (let index = 0; index < bars.length; index += 1) {
    sum += bars[index]!.close;
    if (index >= period) sum -= bars[index - period]!.close;
    if (index >= period - 1) {
      points.push({
        time: bars[index]!.time as UTCTimestamp,
        value: sum / period,
      });
    }
  }
  return points;
}

function maValueAt(
  points: LinePoint[],
  time: number,
): number | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index]!.time === time) return points[index]!.value;
  }
  return undefined;
}

function legendFromBar(
  bar: MarketOhlcvBar,
  ma: { ma5: LinePoint[]; ma10: LinePoint[]; ma20: LinePoint[] },
  visible: MaVisibility,
): LegendState {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    ma5: visible.ma5 ? maValueAt(ma.ma5, bar.time) : undefined,
    ma10: visible.ma10 ? maValueAt(ma.ma10, bar.time) : undefined,
    ma20: visible.ma20 ? maValueAt(ma.ma20, bar.time) : undefined,
  };
}

function barAtTime(
  bars: MarketOhlcvBar[],
  time: number,
): MarketOhlcvBar | undefined {
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    if (bars[index]!.time === time) return bars[index];
  }
  return undefined;
}

/**
 * Self-hosted OHLCV chart with MA overlays, live price line, and candle/line styles.
 */
export function MarketTrendChart({
  symbol,
  className,
  height = 420,
  timezone = 'Etc/UTC',
  defaultInterval = DEFAULT_INTERVAL,
  lastPrice,
  asOf,
}: {
  symbol: string;
  className?: string;
  height?: number;
  timezone?: string;
  defaultInterval?: ChartInterval;
  lastPrice?: number;
  asOf?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma5Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const barsRef = useRef<MarketOhlcvBar[]>([]);
  const maCacheRef = useRef<{
    ma5: LinePoint[];
    ma10: LinePoint[];
    ma20: LinePoint[];
  }>({ ma5: [], ma10: [], ma20: [] });
  const hoveringRef = useRef(false);
  const titleId = useId();
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation('stock');
  const isDark = resolvedTheme === 'dark';
  const [interval, setInterval] = useState<ChartInterval>(defaultInterval);
  const [style, setStyle] = useState<ChartStyle>('candle');
  const [maVisible, setMaVisible] = useState<MaVisibility>(DEFAULT_MA_VISIBLE);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const maVisibleRef = useRef(maVisible);
  maVisibleRef.current = maVisible;

  const range =
    CHART_INTERVALS.find((item) => item.value === interval)?.range ?? 120;
  const isIntraday =
    interval === '5' ||
    interval === '15' ||
    interval === '30' ||
    interval === '60';

  const ohlcv = useQuery({
    queryKey: ['market-ohlcv', symbol, interval, range],
    queryFn: async () => {
      const response = await getMarketOhlcv(symbol, interval, { range });
      return response.data;
    },
    enabled: Boolean(symbol),
    staleTime: 30_000,
  });

  const paintChart = (bars: MarketOhlcvBar[], fit: boolean) => {
    const chart = chartRef.current;
    const volumes = volumeRef.current;
    const ma5 = ma5Ref.current;
    const ma10 = ma10Ref.current;
    const ma20 = ma20Ref.current;
    if (!chart || !volumes || !ma5 || !ma10 || !ma20 || !bars.length) return;

    const colors = chartColors(isDark);
    const ma = {
      ma5: sma(bars, 5),
      ma10: sma(bars, 10),
      ma20: sma(bars, 20),
    };
    maCacheRef.current = ma;
    barsRef.current = bars;

    if (style === 'candle' && candleRef.current) {
      candleRef.current.setData(
        bars.map((bar) => ({
          time: bar.time as UTCTimestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      );
    }
    if (style === 'line' && lineRef.current) {
      lineRef.current.setData(
        bars.map((bar) => ({
          time: bar.time as UTCTimestamp,
          value: bar.close,
        })),
      );
    }

    volumes.setData(
      bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color:
          bar.close >= bar.open
            ? withAlpha(colors.rise, '66')
            : withAlpha(colors.fall, '66'),
      })),
    );
    ma5.setData(ma.ma5);
    ma10.setData(ma.ma10);
    ma20.setData(ma.ma20);
    ma5.applyOptions({ visible: maVisibleRef.current.ma5 });
    ma10.applyOptions({ visible: maVisibleRef.current.ma10 });
    ma20.applyOptions({ visible: maVisibleRef.current.ma20 });

    const price = lastPrice ?? bars[bars.length - 1]!.close;
    const hostSeries = style === 'candle' ? candleRef.current : lineRef.current;
    if (hostSeries) {
      if (!priceLineRef.current) {
        priceLineRef.current = hostSeries.createPriceLine({
          price,
          color: colors.accent,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '',
        });
      } else {
        priceLineRef.current.applyOptions({ price });
      }
    }

    if (fit) chart.timeScale().fitContent();
    if (!hoveringRef.current) {
      setLegend(legendFromBar(bars[bars.length - 1]!, ma, maVisibleRef.current));
    }
  };

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const colors = chartColors(isDark);
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid, style: LineStyle.SparseDotted },
        horzLines: { color: colors.grid, style: LineStyle.SparseDotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: colors.crosshair,
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: colors.labelBg,
        },
        horzLine: {
          color: colors.crosshair,
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: colors.labelBg,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: isIntraday,
        secondsVisible: false,
        rightOffset: 4,
        minBarSpacing: 4,
      },
      localization: {
        timeFormatter: (time: number) =>
          new Intl.DateTimeFormat(undefined, {
            timeZone: timezone,
            month: 'short',
            day: 'numeric',
            ...(isIntraday
              ? { hour: '2-digit', minute: '2-digit', hour12: false }
              : {}),
            ...(interval === 'M' ? { year: 'numeric', month: 'short' } : {}),
          }).format(new Date(time * 1_000)),
      },
    });

    let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
    if (style === 'candle') {
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: colors.rise,
        downColor: colors.fall,
        borderUpColor: colors.rise,
        borderDownColor: colors.fall,
        wickUpColor: withAlpha(colors.rise, 'CC'),
        wickDownColor: withAlpha(colors.fall, 'CC'),
        borderVisible: false,
      });
      candleRef.current = candles;
      lineRef.current = null;
      mainSeries = candles;
    } else {
      const line = chart.addSeries(LineSeries, {
        color: colors.line,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      lineRef.current = line;
      candleRef.current = null;
      mainSeries = line;
    }

    const volumes = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    });

    const ma5 = chart.addSeries(LineSeries, {
      color: MA_PERIODS[0].color,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const ma10 = chart.addSeries(LineSeries, {
      color: MA_PERIODS[1].color,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const ma20 = chart.addSeries(LineSeries, {
      color: MA_PERIODS[2].color,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    volumeRef.current = volumes;
    ma5Ref.current = ma5;
    ma10Ref.current = ma10;
    ma20Ref.current = ma20;
    priceLineRef.current = null;

    chart.subscribeCrosshairMove((param) => {
      const time =
        typeof param.time === 'number'
          ? param.time
          : param.time && typeof param.time === 'object' && 'timestamp' in param.time
            ? Number((param.time as { timestamp: number }).timestamp)
            : undefined;
      if (time === undefined || !param.seriesData.size) {
        hoveringRef.current = false;
        const last = barsRef.current[barsRef.current.length - 1];
        setLegend(
          last ? legendFromBar(last, maCacheRef.current, maVisibleRef.current) : null,
        );
        return;
      }
      const bar = barAtTime(barsRef.current, time);
      if (!bar) {
        hoveringRef.current = false;
        return;
      }
      hoveringRef.current = true;
      setLegend(legendFromBar(bar, maCacheRef.current, maVisibleRef.current));
    });

    // Re-paint if history is already loaded when style/theme remounts the chart.
    if (barsRef.current.length) {
      paintChart(barsRef.current, true);
    } else {
      void mainSeries;
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      lineRef.current = null;
      volumeRef.current = null;
      ma5Ref.current = null;
      ma10Ref.current = null;
      ma20Ref.current = null;
      priceLineRef.current = null;
    };
    // paintChart closes over lastPrice/style/isDark; remount covers style/theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional remount deps
  }, [isDark, interval, timezone, isIntraday, style]);

  useEffect(() => {
    const bars = ohlcv.data?.bars;
    if (!bars?.length) return;
    paintChart(bars, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint when history arrives
  }, [ohlcv.data, isDark, style]);

  useEffect(() => {
    if (lastPrice === undefined || !Number.isFinite(lastPrice)) return;
    if (!barsRef.current.length) return;

    const asOfUnix = asOf
      ? Math.floor(new Date(asOf).getTime() / 1_000)
      : Math.floor(Date.now() / 1_000);
    if (!Number.isFinite(asOfUnix)) return;

    const next = applyLivePrice(
      barsRef.current,
      lastPrice,
      asOfUnix,
      interval,
    );
    const previousLast = barsRef.current[barsRef.current.length - 1];
    const nextLast = next[next.length - 1];
    if (
      previousLast &&
      nextLast &&
      previousLast.time === nextLast.time &&
      previousLast.close === nextLast.close &&
      previousLast.high === nextLast.high &&
      previousLast.low === nextLast.low
    ) {
      priceLineRef.current?.applyOptions({ price: lastPrice });
      return;
    }

    paintChart(next, false);
    priceLineRef.current?.applyOptions({ price: lastPrice });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live quote stream
  }, [lastPrice, asOf, interval, isDark, style]);

  useEffect(() => {
    ma5Ref.current?.applyOptions({ visible: maVisible.ma5 });
    ma10Ref.current?.applyOptions({ visible: maVisible.ma10 });
    ma20Ref.current?.applyOptions({ visible: maVisible.ma20 });
    const last = barsRef.current[barsRef.current.length - 1];
    if (last && !hoveringRef.current) {
      setLegend(legendFromBar(last, maCacheRef.current, maVisible));
    }
  }, [maVisible]);

  const showEmpty =
    !ohlcv.isLoading && (ohlcv.isError || !(ohlcv.data?.bars.length ?? 0));
  const closeUp = legend ? legend.close >= legend.open : true;

  return (
    <div
      className={cn('overflow-hidden border border-border bg-card', className)}
      aria-labelledby={titleId}
    >
      <div className="flex h-10 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2
            id={titleId}
            className="shrink-0 text-sm font-semibold tracking-tight"
          >
            {t('chart.title')}
          </h2>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={style}
            onValueChange={(value) => {
              if (value) setStyle(value as ChartStyle);
            }}
            aria-label={t('chart.style')}
            className="hidden rounded-none sm:inline-flex"
          >
            <ToggleGroupItem
              value="candle"
              aria-label={t('chart.styles.candle')}
              className="size-7 rounded-none p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <CandlestickChart className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="line"
              aria-label={t('chart.styles.line')}
              className="size-7 rounded-none p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <ChartLine className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="multiple"
            size="sm"
            variant="outline"
            spacing={0}
            value={MA_PERIODS.filter((item) => maVisible[item.key]).map(
              (item) => item.key,
            )}
            onValueChange={(values) => {
              setMaVisible({
                ma5: values.includes('ma5'),
                ma10: values.includes('ma10'),
                ma20: values.includes('ma20'),
              });
            }}
            aria-label={t('chart.ma')}
            className="rounded-none"
          >
            {MA_PERIODS.map((item) => (
              <ToggleGroupItem
                key={item.key}
                value={item.key}
                className="h-7 rounded-none px-1.5 font-mono text-[10px] tabular-nums data-[state=on]:bg-transparent data-[state=on]:text-foreground data-[state=off]:text-muted-foreground"
                style={
                  maVisible[item.key]
                    ? { color: item.color, borderColor: `${item.color}66` }
                    : undefined
                }
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={interval}
          onValueChange={(value) => {
            if (value) setInterval(value as ChartInterval);
          }}
          aria-label={t('chart.interval')}
          className="rounded-none"
        >
          {CHART_INTERVALS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="h-7 min-w-9 rounded-none px-2 font-mono text-[11px] tabular-nums data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {t(`chart.intervals.${item.labelKey}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="relative w-full" style={{ height }}>
        {legend ? (
          <div className="pointer-events-none absolute top-2 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-mono text-[11px] tabular-nums">
            <span className="text-muted-foreground">
              O{' '}
              <span className="text-foreground/90">
                {formatPrice(legend.open)}
              </span>
            </span>
            <span className="text-muted-foreground">
              H{' '}
              <span className="text-foreground/90">
                {formatPrice(legend.high)}
              </span>
            </span>
            <span className="text-muted-foreground">
              L{' '}
              <span className="text-foreground/90">
                {formatPrice(legend.low)}
              </span>
            </span>
            <span className="text-muted-foreground">
              C{' '}
              <span className={closeUp ? 'text-chart-2' : 'text-chart-3'}>
                {formatPrice(legend.close)}
              </span>
            </span>
            {legend.volume !== undefined ? (
              <span className="text-muted-foreground">
                V{' '}
                <span className="text-foreground/80">
                  {formatVolume(legend.volume)}
                </span>
              </span>
            ) : null}
            {legend.ma5 !== undefined ? (
              <span style={{ color: MA_PERIODS[0].color }}>
                MA5 {formatPrice(legend.ma5)}
              </span>
            ) : null}
            {legend.ma10 !== undefined ? (
              <span style={{ color: MA_PERIODS[1].color }}>
                MA10 {formatPrice(legend.ma10)}
              </span>
            ) : null}
            {legend.ma20 !== undefined ? (
              <span style={{ color: MA_PERIODS[2].color }}>
                MA20 {formatPrice(legend.ma20)}
              </span>
            ) : null}
          </div>
        ) : null}
        <div ref={containerRef} className="absolute inset-0" />
        {ohlcv.isLoading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/70 text-sm text-muted-foreground">
            {t('chart.loading')}
          </div>
        ) : null}
        {showEmpty ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-card px-4 text-center text-sm text-muted-foreground">
            {t('chart.unavailable')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Prefer MarketTrendChart — kept for existing imports. */
export const TradingViewAdvancedChart = MarketTrendChart;
