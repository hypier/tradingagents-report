export type CreditPricingSettings = {
  pointsPerUsd: string;
  markupBasisPoints: number;
};

type Fraction = {
  numerator: bigint;
  denominator: bigint;
};

const BASIS_POINTS = 10_000n;
const BASIS_POINTS_NUMBER = Number(BASIS_POINTS);

/** Convert actual analysis cost USD into billable credit points. */
export function calculateActualPoints(
  actualCostUsd: string,
  settings: CreditPricingSettings,
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

function ceilFraction(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function safePointNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Calculated points exceed the safe integer range');
  }
  return Number(value);
}
