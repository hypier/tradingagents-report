import { Hono } from 'hono';

import { apiSuccess } from '../../shared/contracts';
import {
  LLM_SETTINGS_KEY,
  roleAllows,
  type LlmSettingsValue,
} from '../../shared/llm-providers';
import type { AppDependencies, AppEnvironment } from '../app';

export function llmCatalogRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/llm-catalog', async (context) => {
    const [providers, models, settingsRow] = await Promise.all([
      dependencies.database.llmCatalog.listProviders(),
      dependencies.database.llmCatalog.listModels({ enabledOnly: true }),
      dependencies.database.settings.get(LLM_SETTINGS_KEY),
    ]);
    const defaults = (settingsRow?.value ?? {}) as Partial<LlmSettingsValue>;
    const enabledProviders = providers.filter(
      (provider) => provider.enabled && provider.apiKeyCiphertext,
    );
    const providerIds = new Set(enabledProviders.map((row) => row.id));
    const catalogModels = models
      .filter((model) => providerIds.has(model.providerId))
      .map((model) => ({
        id: model.id,
        providerId: model.providerId,
        model: model.model,
        displayName: model.displayName,
        role: model.role,
        canQuick: roleAllows(model.role, 'quick'),
        canDeep: roleAllows(model.role, 'deep'),
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        currency: model.currency,
      }));

    return context.json(
      apiSuccess(
        {
          providers: enabledProviders.map((provider) => ({
            id: provider.id,
            driver: provider.driver,
            displayName: provider.displayName,
          })),
          models: catalogModels,
          defaults: {
            defaultQuickModelId: defaults.defaultQuickModelId ?? null,
            defaultDeepModelId: defaults.defaultDeepModelId ?? null,
          },
        },
        context.get('requestId'),
      ),
    );
  });

  return app;
}
