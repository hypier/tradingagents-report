/**
 * 按市场与分析师数量解析分析额度消耗单位。
 * 无匹配规则时回退 DEFAULT_ANALYSIS_CREDIT_UNITS。
 */
export const DEFAULT_ANALYSIS_CREDIT_UNITS = 1;

/** @deprecated 使用 resolveCreditUnits；保留常量兼容展示回退。 */
export const ANALYSIS_CREDIT_UNITS = DEFAULT_ANALYSIS_CREDIT_UNITS;

export type CreditRuleMatchInput = {
  market?: string | null;
  analystCount: number;
};

export type CreditRuleLike = {
  market: string | null;
  minAnalysts: number;
  maxAnalysts: number;
  units: number;
  enabled: number | boolean;
  priority: number;
};

export function resolveCreditUnits(
  input: CreditRuleMatchInput,
  rules: CreditRuleLike[],
): number {
  const analystCount = Math.max(1, Math.floor(input.analystCount) || 1);
  const market = input.market?.trim().toUpperCase() || null;

  const matched = rules
    .filter((rule) => {
      const enabled = rule.enabled === true || rule.enabled === 1;
      if (!enabled) return false;
      if (analystCount < rule.minAnalysts || analystCount > rule.maxAnalysts) {
        return false;
      }
      if (rule.market == null || rule.market === '') return true;
      if (!market) return false;
      return rule.market.trim().toUpperCase() === market;
    })
    .sort((a, b) => b.priority - a.priority);

  const units = matched[0]?.units;
  if (typeof units === 'number' && Number.isInteger(units) && units >= 0) {
    return units;
  }
  return DEFAULT_ANALYSIS_CREDIT_UNITS;
}
