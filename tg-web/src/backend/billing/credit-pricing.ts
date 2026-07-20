export type CreditPricingSettings = {
  pointsPerUsd: string;
  markupBasisPoints: number;
  reserveBufferBasisPoints: number;
};

export type BillingSignatureInput = {
  analysts: string[];
  configOverrides?: Record<string, unknown>;
};

type Fraction = {
  numerator: bigint;
  denominator: bigint;
};

const BASIS_POINTS = 10_000n;

export function calculateReservedPoints(
  estimatedCostUsd: string,
  settings: CreditPricingSettings,
): number {
  const cost = decimalFraction(estimatedCostUsd);
  if (cost.numerator === 0n) return 0;
  const ratio = decimalFraction(settings.pointsPerUsd);
  const result = ceilFraction(
    cost.numerator *
      ratio.numerator *
      BigInt(BASIS_POINTS_NUMBER + settings.markupBasisPoints) *
      BigInt(BASIS_POINTS_NUMBER + settings.reserveBufferBasisPoints),
    cost.denominator * ratio.denominator * BASIS_POINTS * BASIS_POINTS,
  );
  return safePointNumber(result);
}

export function calculateActualPoints(
  actualCostUsd: string,
  settings: Pick<CreditPricingSettings, 'pointsPerUsd' | 'markupBasisPoints'>,
): number {
  const cost = decimalFraction(actualCostUsd);
  if (cost.numerator === 0n) return 0;
  const ratio = decimalFraction(settings.pointsPerUsd);
  const result = ceilFraction(
    cost.numerator *
      ratio.numerator *
      BigInt(BASIS_POINTS_NUMBER + settings.markupBasisPoints),
    cost.denominator * ratio.denominator * BASIS_POINTS,
  );
  return safePointNumber(result > 0n ? result : 1n);
}

export function discreteP90(costs: string[]): string | undefined {
  if (costs.length === 0) return undefined;
  const sorted = [...costs].sort(compareDecimals);
  return sorted[Math.ceil(sorted.length * 0.9) - 1];
}

export function buildBillingSignature(input: BillingSignatureInput): string {
  const config = input.configOverrides ?? {};
  return JSON.stringify({
    analysts: [...new Set(input.analysts)].sort(),
    llmProvider: stringValue(config.llm_provider),
    deepThinkLlm: stringValue(config.deep_think_llm),
    quickThinkLlm: stringValue(config.quick_think_llm),
    maxDebateRounds: integerValue(config.max_debate_rounds),
    maxRiskDiscussRounds: integerValue(config.max_risk_discuss_rounds),
  });
}

const BASIS_POINTS_NUMBER = Number(BASIS_POINTS);

function decimalFraction(value: string): Fraction {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new RangeError('Expected a non-negative decimal value');
  const fraction = match[2] ?? '';
  return {
    numerator: BigInt(`${match[1]}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
}

function compareDecimals(left: string, right: string): number {
  const a = decimalFraction(left);
  const b = decimalFraction(right);
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function ceilFraction(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function safePointNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Calculated points exceed the safe integer range');
  }
  return Number(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
