/**
 * models.dev provider logo IDs (https://models.dev/logos/{id}.svg).
 * Aligns with aliases used by model-sync pricing lookup.
 */
export const LLM_PROVIDER_MODELS_DEV_IDS: Record<string, string> = {
  openai: 'openai',
  openai_compatible: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  azure: 'azure',
  bedrock: 'amazon-bedrock',
  xai: 'xai',
  deepseek: 'deepseek',
  qwen: 'alibaba',
  'qwen-cn': 'alibaba',
  glm: 'zhipuai',
  'glm-cn': 'zhipuai',
  minimax: 'minimax',
  'minimax-cn': 'minimax',
  openrouter: 'openrouter',
  mistral: 'mistral',
  kimi: 'moonshotai',
  groq: 'groq',
  nvidia: 'nvidia',
  ollama: 'ollama-cloud',
};

export function modelsDevProviderId(providerOrDriverId: string): string {
  return LLM_PROVIDER_MODELS_DEV_IDS[providerOrDriverId] ?? providerOrDriverId;
}

export function llmProviderLogoUrl(providerOrDriverId: string): string {
  return `https://models.dev/logos/${modelsDevProviderId(providerOrDriverId)}.svg`;
}
