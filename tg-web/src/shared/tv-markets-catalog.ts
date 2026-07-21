/**
 * Persisted TradingView stock leaderboard `market_code` catalog.
 * Source: TradingView scanner / RapidAPI metadata markets (≈68).
 * Continents are product groupings for the quotes desk picker.
 */

export const TV_MARKET_CONTINENTS = [
  'north_america',
  'europe',
  'asia_oceania',
  'middle_east_africa',
  'south_america',
] as const;

export type TvMarketContinent = (typeof TV_MARKET_CONTINENTS)[number];

export type TvMarketEntry = {
  code: string;
  continent: TvMarketContinent;
  en: string;
  zh: string;
};

/** Full stock-market catalog used by the quotes desk. */
export const TV_MARKETS_CATALOG: readonly TvMarketEntry[] = [
  // North America
  { code: 'america', continent: 'north_america', en: 'United States', zh: '美国' },
  { code: 'canada', continent: 'north_america', en: 'Canada', zh: '加拿大' },

  // Europe
  { code: 'austria', continent: 'europe', en: 'Austria', zh: '奥地利' },
  { code: 'belgium', continent: 'europe', en: 'Belgium', zh: '比利时' },
  { code: 'croatia', continent: 'europe', en: 'Croatia', zh: '克罗地亚' },
  { code: 'cyprus', continent: 'europe', en: 'Cyprus', zh: '塞浦路斯' },
  { code: 'czech', continent: 'europe', en: 'Czech Republic', zh: '捷克' },
  { code: 'denmark', continent: 'europe', en: 'Denmark', zh: '丹麦' },
  { code: 'estonia', continent: 'europe', en: 'Estonia', zh: '爱沙尼亚' },
  { code: 'finland', continent: 'europe', en: 'Finland', zh: '芬兰' },
  { code: 'france', continent: 'europe', en: 'France', zh: '法国' },
  { code: 'germany', continent: 'europe', en: 'Germany', zh: '德国' },
  { code: 'greece', continent: 'europe', en: 'Greece', zh: '希腊' },
  { code: 'hungary', continent: 'europe', en: 'Hungary', zh: '匈牙利' },
  { code: 'iceland', continent: 'europe', en: 'Iceland', zh: '冰岛' },
  { code: 'ireland', continent: 'europe', en: 'Ireland', zh: '爱尔兰' },
  { code: 'italy', continent: 'europe', en: 'Italy', zh: '意大利' },
  { code: 'latvia', continent: 'europe', en: 'Latvia', zh: '拉脱维亚' },
  { code: 'lithuania', continent: 'europe', en: 'Lithuania', zh: '立陶宛' },
  { code: 'luxembourg', continent: 'europe', en: 'Luxembourg', zh: '卢森堡' },
  { code: 'netherlands', continent: 'europe', en: 'Netherlands', zh: '荷兰' },
  { code: 'norway', continent: 'europe', en: 'Norway', zh: '挪威' },
  { code: 'poland', continent: 'europe', en: 'Poland', zh: '波兰' },
  { code: 'portugal', continent: 'europe', en: 'Portugal', zh: '葡萄牙' },
  { code: 'romania', continent: 'europe', en: 'Romania', zh: '罗马尼亚' },
  { code: 'russia', continent: 'europe', en: 'Russia', zh: '俄罗斯' },
  { code: 'serbia', continent: 'europe', en: 'Serbia', zh: '塞尔维亚' },
  { code: 'slovakia', continent: 'europe', en: 'Slovakia', zh: '斯洛伐克' },
  { code: 'slovenia', continent: 'europe', en: 'Slovenia', zh: '斯洛文尼亚' },
  { code: 'spain', continent: 'europe', en: 'Spain', zh: '西班牙' },
  { code: 'sweden', continent: 'europe', en: 'Sweden', zh: '瑞典' },
  { code: 'switzerland', continent: 'europe', en: 'Switzerland', zh: '瑞士' },
  { code: 'turkey', continent: 'europe', en: 'Turkey', zh: '土耳其' },
  { code: 'uk', continent: 'europe', en: 'United Kingdom', zh: '英国' },
  { code: 'ukraine', continent: 'europe', en: 'Ukraine', zh: '乌克兰' },

  // Asia & Oceania
  { code: 'australia', continent: 'asia_oceania', en: 'Australia', zh: '澳大利亚' },
  { code: 'bangladesh', continent: 'asia_oceania', en: 'Bangladesh', zh: '孟加拉国' },
  { code: 'china', continent: 'asia_oceania', en: 'China', zh: '中国' },
  { code: 'hongkong', continent: 'asia_oceania', en: 'Hong Kong', zh: '香港' },
  { code: 'india', continent: 'asia_oceania', en: 'India', zh: '印度' },
  { code: 'indonesia', continent: 'asia_oceania', en: 'Indonesia', zh: '印度尼西亚' },
  { code: 'japan', continent: 'asia_oceania', en: 'Japan', zh: '日本' },
  { code: 'korea', continent: 'asia_oceania', en: 'South Korea', zh: '韩国' },
  { code: 'malaysia', continent: 'asia_oceania', en: 'Malaysia', zh: '马来西亚' },
  { code: 'newzealand', continent: 'asia_oceania', en: 'New Zealand', zh: '新西兰' },
  { code: 'pakistan', continent: 'asia_oceania', en: 'Pakistan', zh: '巴基斯坦' },
  { code: 'philippines', continent: 'asia_oceania', en: 'Philippines', zh: '菲律宾' },
  { code: 'singapore', continent: 'asia_oceania', en: 'Singapore', zh: '新加坡' },
  { code: 'srilanka', continent: 'asia_oceania', en: 'Sri Lanka', zh: '斯里兰卡' },
  { code: 'taiwan', continent: 'asia_oceania', en: 'Taiwan', zh: '台湾' },
  { code: 'thailand', continent: 'asia_oceania', en: 'Thailand', zh: '泰国' },
  { code: 'vietnam', continent: 'asia_oceania', en: 'Vietnam', zh: '越南' },

  // Middle East & Africa
  { code: 'bahrain', continent: 'middle_east_africa', en: 'Bahrain', zh: '巴林' },
  { code: 'egypt', continent: 'middle_east_africa', en: 'Egypt', zh: '埃及' },
  { code: 'israel', continent: 'middle_east_africa', en: 'Israel', zh: '以色列' },
  { code: 'jordan', continent: 'middle_east_africa', en: 'Jordan', zh: '约旦' },
  { code: 'kenya', continent: 'middle_east_africa', en: 'Kenya', zh: '肯尼亚' },
  { code: 'kuwait', continent: 'middle_east_africa', en: 'Kuwait', zh: '科威特' },
  { code: 'lebanon', continent: 'middle_east_africa', en: 'Lebanon', zh: '黎巴嫩' },
  { code: 'morocco', continent: 'middle_east_africa', en: 'Morocco', zh: '摩洛哥' },
  { code: 'qatar', continent: 'middle_east_africa', en: 'Qatar', zh: '卡塔尔' },
  { code: 'saudiarabia', continent: 'middle_east_africa', en: 'Saudi Arabia', zh: '沙特阿拉伯' },
  { code: 'southafrica', continent: 'middle_east_africa', en: 'South Africa', zh: '南非' },
  { code: 'uae', continent: 'middle_east_africa', en: 'United Arab Emirates', zh: '阿联酋' },

  // South America
  { code: 'argentina', continent: 'south_america', en: 'Argentina', zh: '阿根廷' },
  { code: 'brazil', continent: 'south_america', en: 'Brazil', zh: '巴西' },
  { code: 'chile', continent: 'south_america', en: 'Chile', zh: '智利' },
  { code: 'colombia', continent: 'south_america', en: 'Colombia', zh: '哥伦比亚' },
  { code: 'mexico', continent: 'south_america', en: 'Mexico', zh: '墨西哥' },
  { code: 'peru', continent: 'south_america', en: 'Peru', zh: '秘鲁' },
] as const;

const BY_CODE = new Map(
  TV_MARKETS_CATALOG.map((entry) => [entry.code, entry] as const),
);

export function getTvMarketEntry(code: string): TvMarketEntry | undefined {
  return BY_CODE.get(code.trim().toLowerCase());
}

export function isKnownTvMarketCode(code: string): boolean {
  return BY_CODE.has(code.trim().toLowerCase());
}

export function displayNameForTvMarket(
  marketCode: string,
  locale: 'en' | 'zh' = 'en',
): string {
  const entry = getTvMarketEntry(marketCode);
  if (entry) return entry[locale] || entry.en;
  const normalized = marketCode.trim().toLowerCase();
  if (!normalized) return marketCode;
  return normalized
    .split(/[_-]/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function listTvMarkets(
  locale: 'en' | 'zh' = 'en',
): Array<{ code: string; displayName: string; continent: TvMarketContinent }> {
  return TV_MARKETS_CATALOG.map((entry) => ({
    code: entry.code,
    displayName: entry[locale] || entry.en,
    continent: entry.continent,
  }));
}

export function groupTvMarketsByContinent(
  locale: 'en' | 'zh' = 'en',
): Array<{
  continent: TvMarketContinent;
  markets: Array<{ code: string; displayName: string }>;
}> {
  return TV_MARKET_CONTINENTS.map((continent) => ({
    continent,
    markets: TV_MARKETS_CATALOG.filter((entry) => entry.continent === continent).map(
      (entry) => ({
        code: entry.code,
        displayName: entry[locale] || entry.en,
      }),
    ),
  })).filter((group) => group.markets.length > 0);
}
