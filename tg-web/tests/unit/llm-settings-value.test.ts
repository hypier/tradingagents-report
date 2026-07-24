import { describe, expect, it } from 'vitest';

import { parseLlmSettingsValue } from '../../src/shared/llm-providers';

describe('parseLlmSettingsValue', () => {
  it('reads defaults from settings.get() value object (not a DB row)', () => {
    expect(
      parseLlmSettingsValue({
        defaultQuickModelId: '11111111-1111-1111-1111-111111111111',
        defaultDeepModelId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toEqual({
      defaultQuickModelId: '11111111-1111-1111-1111-111111111111',
      defaultDeepModelId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('does not look for a nested .value field', () => {
    expect(
      parseLlmSettingsValue({
        value: {
          defaultQuickModelId: '11111111-1111-1111-1111-111111111111',
          defaultDeepModelId: '22222222-2222-2222-2222-222222222222',
        },
      }),
    ).toEqual({
      defaultQuickModelId: null,
      defaultDeepModelId: null,
    });
  });

  it('returns nulls for missing or invalid input', () => {
    expect(parseLlmSettingsValue(null)).toEqual({
      defaultQuickModelId: null,
      defaultDeepModelId: null,
    });
    expect(parseLlmSettingsValue(undefined)).toEqual({
      defaultQuickModelId: null,
      defaultDeepModelId: null,
    });
    expect(parseLlmSettingsValue({})).toEqual({
      defaultQuickModelId: null,
      defaultDeepModelId: null,
    });
  });
});
