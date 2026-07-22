import {
  roleAllows,
  type LlmSettingsValue,
} from '../../shared/llm-providers';
import type { LlmCatalogRepository } from '../database/llm-catalog-repository';
import { AppError } from '../errors/app-error';

export async function validateLlmDefaults(
  catalog: LlmCatalogRepository,
  input: {
    defaultQuickModelId: string;
    defaultDeepModelId: string;
  },
): Promise<LlmSettingsValue> {
  const models = await catalog.getModelsByIds([
    input.defaultQuickModelId,
    input.defaultDeepModelId,
  ]);
  const quick = models.find((row) => row.id === input.defaultQuickModelId);
  const deep = models.find((row) => row.id === input.defaultDeepModelId);
  if (!quick || !deep) {
    throw new AppError('INVALID_REQUEST', 400, 'Default model not found');
  }
  if (!quick.enabled || !roleAllows(quick.role, 'quick')) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Default quick model must be enabled for quick role',
    );
  }
  if (!deep.enabled || !roleAllows(deep.role, 'deep')) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Default deep model must be enabled for deep role',
    );
  }
  if (quick.providerId !== deep.providerId) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Default quick and deep models must share the same provider',
    );
  }
  const provider = await catalog.getProvider(quick.providerId);
  if (!provider?.enabled || !provider.apiKeyCiphertext) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'Default models require an enabled provider with API key',
    );
  }
  return {
    defaultQuickModelId: quick.id,
    defaultDeepModelId: deep.id,
  };
}
