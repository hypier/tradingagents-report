/** Core 支持的 LLM 提供商白名单（与 api_key_env / factory 对齐）。 */
export const LLM_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'azure',
  'bedrock',
  'xai',
  'deepseek',
  'qwen',
  'qwen-cn',
  'glm',
  'glm-cn',
  'minimax',
  'minimax-cn',
  'openrouter',
  'mistral',
  'kimi',
  'groq',
  'nvidia',
  'ollama',
  'openai_compatible',
] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export const LLM_MODEL_ROLES = ['quick', 'deep', 'both'] as const;
export type LlmModelRole = (typeof LLM_MODEL_ROLES)[number];

export const LLM_SETTINGS_KEY = 'llm';

/** Catalog instance id: lowercase slug, independent from driver. */
export const LLM_PROVIDER_INSTANCE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

export type LlmSettingsValue = {
  defaultQuickModelId: string | null;
  defaultDeepModelId: string | null;
};

/**
 * `settings.get(LLM_SETTINGS_KEY)` already returns the JSON value object
 * (or null), not a DB row. Callers must not read `.value` again.
 */
export function parseLlmSettingsValue(
  value: Record<string, unknown> | null | undefined,
): LlmSettingsValue {
  const record =
    typeof value === 'object' && value !== null ? value : {};
  return {
    defaultQuickModelId:
      typeof record.defaultQuickModelId === 'string'
        ? record.defaultQuickModelId
        : null,
    defaultDeepModelId:
      typeof record.defaultDeepModelId === 'string'
        ? record.defaultDeepModelId
        : null,
  };
}

export function isLlmProviderId(value: string): value is LlmProviderId {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isLlmProviderInstanceId(value: string): boolean {
  return LLM_PROVIDER_INSTANCE_ID_PATTERN.test(value);
}

export function providerRequiresBaseUrl(driver: string): boolean {
  return driver === 'openai_compatible';
}

export function roleAllows(
  role: string,
  needed: 'quick' | 'deep',
): boolean {
  return role === 'both' || role === needed;
}
