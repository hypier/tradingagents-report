import {
  LLM_SETTINGS_KEY,
  roleAllows,
  type LlmSettingsValue,
} from '../../shared/llm-providers';
import type { AppDependencies } from '../app';
import { AppError } from '../errors/app-error';

export type AnalysisModelSelection = {
  quickModelId?: string | null;
  deepModelId?: string | null;
};

export type ResolvedAnalysisLlm = {
  llmProvider: string;
  quickThinkLlm: string;
  deepThinkLlm: string;
  quickModelId: string;
  deepModelId: string;
  configOverrides: Record<string, unknown>;
};

export async function resolveAnalysisLlm(
  dependencies: AppDependencies,
  selection: AnalysisModelSelection,
  existingOverrides: Record<string, unknown> = {},
): Promise<ResolvedAnalysisLlm> {
  const settingsRow = await dependencies.database.settings.get(LLM_SETTINGS_KEY);
  const defaults = (settingsRow?.value ?? {}) as Partial<LlmSettingsValue>;
  const quickModelId =
    selection.quickModelId || defaults.defaultQuickModelId || null;
  const deepModelId =
    selection.deepModelId || defaults.defaultDeepModelId || null;

  if (!quickModelId || !deepModelId) {
    throw new AppError(
      'LLM_NOT_CONFIGURED',
      400,
      'No analysis models configured. Ask an admin to enable models and set defaults.',
    );
  }

  const models = await dependencies.database.llmCatalog.getModelsByIds([
    quickModelId,
    deepModelId,
  ]);
  const quick = models.find((row) => row.id === quickModelId);
  const deep = models.find((row) => row.id === deepModelId);
  if (!quick || !deep) {
    throw new AppError('INVALID_REQUEST', 400, 'Selected model not found');
  }
  if (!quick.enabled || !roleAllows(quick.role, 'quick')) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Selected quick model is not available',
    );
  }
  if (!deep.enabled || !roleAllows(deep.role, 'deep')) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Selected deep model is not available',
    );
  }
  if (quick.providerId !== deep.providerId) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Quick and deep models must use the same provider',
    );
  }

  const provider = await dependencies.database.llmCatalog.getProvider(
    quick.providerId,
  );
  if (!provider?.enabled || !provider.apiKeyCiphertext) {
    throw new AppError(
      'LLM_NOT_CONFIGURED',
      400,
      'Selected provider is not available',
    );
  }

  return {
    llmProvider: provider.id,
    quickThinkLlm: quick.model,
    deepThinkLlm: deep.model,
    quickModelId: quick.id,
    deepModelId: deep.id,
    configOverrides: {
      ...existingOverrides,
      llm_provider: provider.id,
      quick_think_llm: quick.model,
      deep_think_llm: deep.model,
    },
  };
}
