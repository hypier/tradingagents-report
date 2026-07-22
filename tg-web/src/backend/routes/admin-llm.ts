import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import {
  isLlmProviderId,
  LLM_MODEL_ROLES,
  LLM_PROVIDER_IDS,
  LLM_SETTINGS_KEY,
  roleAllows,
  type LlmSettingsValue,
} from '../../shared/llm-providers';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { syncModelFromUpstream } from '../llm/model-sync';

const providerUpsertSchema = z.object({
  id: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
  backendUrl: z.string().trim().max(2000).nullable().optional(),
  apiKey: z.string().trim().min(1).max(4000).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

const modelBodySchema = z.object({
  providerId: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(256),
  displayName: z.string().trim().min(1).max(256),
  role: z.enum(LLM_MODEL_ROLES),
  enabled: z.boolean(),
  currency: z.string().trim().min(1).max(16).optional(),
  unitTokens: z.number().int().positive().optional(),
  inputPrice: z.string().trim().nullable().optional(),
  outputPrice: z.string().trim().nullable().optional(),
  cachedInputPrice: z.string().trim().nullable().optional(),
  cacheWritePrice: z.string().trim().nullable().optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
});

const defaultsSchema = z.object({
  defaultQuickModelId: z.string().uuid(),
  defaultDeepModelId: z.string().uuid(),
});

const syncPreviewSchema = z.object({
  providerId: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(256),
});

function publicProvider(row: {
  id: string;
  displayName: string;
  enabled: boolean | number;
  backendUrl: string | null;
  apiKeyHint: string | null;
  apiKeyCiphertext: string | null;
  sortOrder: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    displayName: row.displayName,
    enabled: Boolean(row.enabled),
    backendUrl: row.backendUrl,
    apiKeyHint: row.apiKeyHint,
    hasApiKey: Boolean(row.apiKeyCiphertext),
    sortOrder: row.sortOrder,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function publicModel(row: {
  id: string;
  providerId: string;
  model: string;
  displayName: string;
  role: string;
  enabled: boolean | number;
  currency: string;
  unitTokens: number;
  inputPrice: string | null;
  outputPrice: string | null;
  cachedInputPrice: string | null;
  cacheWritePrice: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  params: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  syncedAt: Date | null;
  syncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    providerId: row.providerId,
    model: row.model,
    displayName: row.displayName,
    role: row.role,
    enabled: Boolean(row.enabled),
    currency: row.currency,
    unitTokens: row.unitTokens,
    inputPrice: row.inputPrice,
    outputPrice: row.outputPrice,
    cachedInputPrice: row.cachedInputPrice,
    cacheWritePrice: row.cacheWritePrice,
    contextWindow: row.contextWindow,
    maxOutputTokens: row.maxOutputTokens,
    params: row.params,
    capabilities: row.capabilities,
    syncedAt: row.syncedAt,
    syncError: row.syncError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readLlmSettings(
  dependencies: AppDependencies,
): Promise<LlmSettingsValue> {
  const row = await dependencies.database.settings.get(LLM_SETTINGS_KEY);
  const value = (row?.value ?? {}) as Partial<LlmSettingsValue>;
  return {
    defaultQuickModelId:
      typeof value.defaultQuickModelId === 'string'
        ? value.defaultQuickModelId
        : null,
    defaultDeepModelId:
      typeof value.defaultDeepModelId === 'string'
        ? value.defaultDeepModelId
        : null,
  };
}

export function adminLlmRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();
  const catalog = () => dependencies.database.llmCatalog;

  app.get('/admin/llm/providers', async (context) => {
    const rows = await catalog().listProviders();
    return context.json(
      apiSuccess(
        {
          providers: rows.map(publicProvider),
          availableIds: LLM_PROVIDER_IDS,
        },
        context.get('requestId'),
      ),
    );
  });

  app.put('/admin/llm/providers/:id', async (context) => {
    const id = context.req.param('id');
    const parsed = providerUpsertSchema.safeParse({
      ...(await context.req.json().catch(() => null)),
      id,
    });
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid provider payload');
    }
    if (!isLlmProviderId(parsed.data.id)) {
      throw new AppError('INVALID_REQUEST', 400, 'Unsupported LLM provider');
    }
    if (parsed.data.enabled && !parsed.data.apiKey) {
      const existing = await catalog().getProvider(parsed.data.id);
      if (!existing?.apiKeyCiphertext) {
        throw new AppError(
          'INVALID_REQUEST',
          400,
          'Enabled provider requires an API key',
        );
      }
    }
    if (parsed.data.apiKey && !dependencies.llmSecrets.configured) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'BILLING_CONFIG_ENCRYPTION_KEY is required to store API keys',
      );
    }

    let apiKeyCiphertext: string | undefined;
    let apiKeyHint: string | undefined;
    if (parsed.data.apiKey) {
      const encrypted = await dependencies.llmSecrets.encrypt(parsed.data.apiKey);
      apiKeyCiphertext = encrypted.ciphertext;
      apiKeyHint = encrypted.hint;
    }

    const row = await catalog().upsertProvider({
      id: parsed.data.id,
      displayName: parsed.data.displayName,
      enabled: parsed.data.enabled,
      backendUrl: parsed.data.backendUrl ?? null,
      sortOrder: parsed.data.sortOrder,
      notes: parsed.data.notes ?? null,
      updateApiKey: Boolean(parsed.data.apiKey),
      apiKeyCiphertext,
      apiKeyHint,
    });

    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_providers.upsert',
      targetType: 'llm_provider',
      targetId: row.id,
      metadata: {
        enabled: row.enabled,
        apiKeyUpdated: Boolean(parsed.data.apiKey),
      },
    });

    return context.json(
      apiSuccess(publicProvider(row), context.get('requestId')),
    );
  });

  app.delete('/admin/llm/providers/:id/api-key', async (context) => {
    const id = context.req.param('id');
    const row = await catalog().clearProviderApiKey(id);
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    if (row.enabled) {
      await catalog().upsertProvider({
        id: row.id,
        displayName: row.displayName,
        enabled: false,
        backendUrl: row.backendUrl,
        sortOrder: row.sortOrder,
        notes: row.notes,
      });
    }
    const refreshed = await catalog().getProvider(id);
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_providers.clear_api_key',
      targetType: 'llm_provider',
      targetId: id,
    });
    return context.json(
      apiSuccess(publicProvider(refreshed!), context.get('requestId')),
    );
  });

  app.delete('/admin/llm/providers/:id', async (context) => {
    const id = context.req.param('id');
    const deleted = await catalog().deleteProvider(id);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_providers.delete',
      targetType: 'llm_provider',
      targetId: id,
    });
    return context.json(apiSuccess({ id }, context.get('requestId')));
  });

  app.get('/admin/llm/models', async (context) => {
    const providerId = context.req.query('providerId') ?? undefined;
    const [models, defaults] = await Promise.all([
      catalog().listModels({ providerId }),
      readLlmSettings(dependencies),
    ]);
    return context.json(
      apiSuccess(
        { models: models.map(publicModel), defaults },
        context.get('requestId'),
      ),
    );
  });

  app.post('/admin/llm/models', async (context) => {
    const parsed = modelBodySchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid model payload');
    }
    const provider = await catalog().getProvider(parsed.data.providerId);
    if (!provider) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    if (parsed.data.enabled && (!provider.enabled || !provider.apiKeyCiphertext)) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Cannot enable model unless provider is enabled with an API key',
      );
    }
    const row = await catalog().createModel(parsed.data);
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_models.create',
      targetType: 'llm_model',
      targetId: row.id,
    });
    return context.json(
      apiSuccess(publicModel(row), context.get('requestId')),
      201,
    );
  });

  app.patch('/admin/llm/models/:id', async (context) => {
    const id = context.req.param('id');
    const parsed = modelBodySchema.partial().safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid model payload');
    }
    const existing = await catalog().getModel(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Model not found');
    }
    const nextEnabled = parsed.data.enabled ?? Boolean(existing.enabled);
    const providerId = parsed.data.providerId ?? existing.providerId;
    if (nextEnabled) {
      const provider = await catalog().getProvider(providerId);
      if (!provider?.enabled || !provider.apiKeyCiphertext) {
        throw new AppError(
          'INVALID_REQUEST',
          400,
          'Cannot enable model unless provider is enabled with an API key',
        );
      }
    }
    const row = await catalog().updateModel(id, parsed.data);
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_models.update',
      targetType: 'llm_model',
      targetId: id,
    });
    return context.json(
      apiSuccess(publicModel(row!), context.get('requestId')),
    );
  });

  app.delete('/admin/llm/models/:id', async (context) => {
    const id = context.req.param('id');
    const deleted = await catalog().deleteModel(id);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 404, 'Model not found');
    }
    const defaults = await readLlmSettings(dependencies);
    if (
      defaults.defaultQuickModelId === id ||
      defaults.defaultDeepModelId === id
    ) {
      await dependencies.database.settings.set(
        LLM_SETTINGS_KEY,
        {
          defaultQuickModelId:
            defaults.defaultQuickModelId === id
              ? null
              : defaults.defaultQuickModelId,
          defaultDeepModelId:
            defaults.defaultDeepModelId === id
              ? null
              : defaults.defaultDeepModelId,
        },
        context.get('auth').userId,
      );
    }
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_models.delete',
      targetType: 'llm_model',
      targetId: id,
    });
    return context.json(apiSuccess({ id }, context.get('requestId')));
  });

  app.post('/admin/llm/models/sync-preview', async (context) => {
    const parsed = syncPreviewSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid sync preview payload');
    }
    const provider = await catalog().getProvider(parsed.data.providerId);
    if (!provider) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    const apiKey = provider.apiKeyCiphertext
      ? await dependencies.llmSecrets.decrypt(provider.apiKeyCiphertext)
      : null;
    const result = await syncModelFromUpstream({
      providerId: parsed.data.providerId,
      model: parsed.data.model,
      apiKey,
      backendUrl: provider.backendUrl,
    });
    if (!result.ok) {
      throw new AppError('UPSTREAM_ERROR', 502, result.error);
    }
    return context.json(
      apiSuccess(result.fields, context.get('requestId')),
    );
  });

  app.post('/admin/llm/models/:id/sync', async (context) => {
    const id = context.req.param('id');
    const model = await catalog().getModel(id);
    if (!model) {
      throw new AppError('NOT_FOUND', 404, 'Model not found');
    }
    const provider = await catalog().getProvider(model.providerId);
    if (!provider) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    const apiKey = provider.apiKeyCiphertext
      ? await dependencies.llmSecrets.decrypt(provider.apiKeyCiphertext)
      : null;
    const result = await syncModelFromUpstream({
      providerId: model.providerId,
      model: model.model,
      apiKey,
      backendUrl: provider.backendUrl,
    });
    if (!result.ok) {
      await catalog().updateModel(id, {
        syncError: result.error,
      });
      throw new AppError('UPSTREAM_ERROR', 502, result.error);
    }
    const updated = await catalog().updateModel(id, {
      ...result.fields,
      displayName: result.fields.displayName ?? model.displayName,
      syncedAt: new Date(),
      syncError: null,
    });
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_models.sync',
      targetType: 'llm_model',
      targetId: id,
    });
    return context.json(
      apiSuccess(publicModel(updated!), context.get('requestId')),
    );
  });

  app.put('/admin/llm/defaults', async (context) => {
    const parsed = defaultsSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid defaults payload');
    }
    const models = await catalog().getModelsByIds([
      parsed.data.defaultQuickModelId,
      parsed.data.defaultDeepModelId,
    ]);
    const quick = models.find(
      (row) => row.id === parsed.data.defaultQuickModelId,
    );
    const deep = models.find(
      (row) => row.id === parsed.data.defaultDeepModelId,
    );
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
    const provider = await catalog().getProvider(quick.providerId);
    if (!provider?.enabled || !provider.apiKeyCiphertext) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Default models require an enabled provider with API key',
      );
    }
    const value: LlmSettingsValue = {
      defaultQuickModelId: quick.id,
      defaultDeepModelId: deep.id,
    };
    await dependencies.database.settings.set(
      LLM_SETTINGS_KEY,
      value,
      context.get('auth').userId,
    );
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_defaults.update',
      targetType: 'product_settings',
      targetId: LLM_SETTINGS_KEY,
      metadata: value,
    });
    return context.json(apiSuccess(value, context.get('requestId')));
  });

  return app;
}
