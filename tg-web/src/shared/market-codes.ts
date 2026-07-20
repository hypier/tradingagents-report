/** 交易所代码到产品市场的粗粒度映射。 */
const EXCHANGE_TO_MARKET: Record<string, string> = {
  NASDAQ: 'US',
  NYSE: 'US',
  AMEX: 'US',
  HKEX: 'HK',
  SSE: 'CN',
  SZSE: 'CN',
};

export function marketFromExchange(
  exchange: string | null | undefined,
): string | null {
  if (!exchange) return null;
  const key = exchange.trim().toUpperCase();
  return EXCHANGE_TO_MARKET[key] ?? null;
}
