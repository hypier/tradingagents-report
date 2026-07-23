import { describe, expect, it } from 'vitest';

import {
  toPublicLedgerEntry,
  toPublicLedgerMetadata,
} from '../../src/backend/billing/ledger-public';

describe('toPublicLedgerMetadata', () => {
  it('strips cost and pricing fields from user-facing ledger metadata', () => {
    expect(
      toPublicLedgerMetadata({
        periodDelta: -10,
        bonusDelta: -4,
        pool: 'period',
        actualCostUsd: '0.123',
        estimatedCostUsd: '1.0',
        pointsPerUsd: '100',
        markupBasisPoints: 1000,
        reservedPoints: 132,
        finalPoints: 14,
        grantKind: 'create',
      }),
    ).toEqual({
      periodDelta: -10,
      bonusDelta: -4,
      pool: 'period',
      grantKind: 'create',
    });
  });
});

describe('toPublicLedgerEntry', () => {
  it('returns a copy with redacted metadata', () => {
    const entry = {
      id: 'entry-1',
      availableDelta: -14,
      metadata: {
        actualCostUsd: '0.5',
        periodDelta: -14,
        bonusDelta: 0,
      },
    };
    const publicEntry = toPublicLedgerEntry(entry);
    expect(publicEntry.metadata).toEqual({
      periodDelta: -14,
      bonusDelta: 0,
    });
    expect(entry.metadata.actualCostUsd).toBe('0.5');
  });
});
