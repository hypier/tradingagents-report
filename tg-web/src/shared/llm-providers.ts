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

export type LlmSettingsValue = {
  defaultQuickModelId: string | null;
  defaultDeepModelId: string | null;
};

export function isLlmProviderId(value: string): value is LlmProviderId {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

export function roleAllows(
  role: string,
  needed: 'quick' | 'deep',
): boolean {
  return role === 'both' || role === needed;
}
