/** 用户侧计费 API 不得下发的账本 metadata 键（成本与计价细节）。 */
export const USER_LEDGER_METADATA_REDACT = [
  'actualCostUsd',
  'estimatedCostUsd',
  'pointsPerUsd',
  'markupBasisPoints',
  'reservedPoints',
  'finalPoints',
] as const;

export function toPublicLedgerMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metadata };
  for (const key of USER_LEDGER_METADATA_REDACT) {
    delete next[key];
  }
  return next;
}

export function toPublicLedgerEntry<
  T extends { metadata: Record<string, unknown> },
>(entry: T): T {
  return {
    ...entry,
    metadata: toPublicLedgerMetadata(entry.metadata ?? {}),
  };
}
