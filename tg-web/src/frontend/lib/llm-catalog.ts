type FetchImplementation = typeof fetch;

export type LlmCatalogModel = {
  id: string;
  providerId: string;
  model: string;
  displayName: string;
  role: string;
  canQuick: boolean;
  canDeep: boolean;
  inputPrice: string | number | null;
  outputPrice: string | number | null;
  currency: string;
};

export type LlmCatalog = {
  providers: Array<{ id: string; displayName: string }>;
  models: LlmCatalogModel[];
  defaults: {
    defaultQuickModelId: string | null;
    defaultDeepModelId: string | null;
  };
};

export async function getLlmCatalog(
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation('/api/llm-catalog');
  if (!response.ok) throw new Error('Unable to load LLM catalog');
  return response.json() as Promise<{ data: LlmCatalog; requestId: string }>;
}
