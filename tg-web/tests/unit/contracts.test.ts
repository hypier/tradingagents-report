import { describe, expect, it } from 'vitest';

import { apiSuccess, isApiFailure } from '../../src/shared/contracts';

describe('shared API contracts', () => {
  it('builds a typed success envelope and identifies failure envelopes', () => {
    expect(apiSuccess({ status: 'ok' }, 'req-1')).toEqual({
      data: { status: 'ok' },
      requestId: 'req-1',
    });
    expect(
      isApiFailure({
        error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req-1' },
      }),
    ).toBe(true);
  });
});
