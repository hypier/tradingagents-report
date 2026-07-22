import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import {
  isLlmProviderId,
  isLlmProviderInstanceId,
  LLM_MODEL_ROLES,
  LLM_PROVIDER_IDS,
  LLM_SETTINGS_KEY,
  providerRequiresBaseUrl,
  type LlmSettingsValue,
} from '../../shared/llm-providers';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { validateLlmDefaults } from '../llm/llm-defaults';
import { listUpstreamModels } from '../llm/list-upstream-models';
import { syncModelFromUpstream } from '../llm/model-sync';
import { testProviderConnection } from '../llm/provider-connection-test';

const providerUpsertSchema = z.object({
  id: z.string().trim().min(1).max(64),
  driver: z.string().trim().min(1).max(64),
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

const providerTestSchema = z.object({
  providerId: z.string().trim().min(1).max(64).optional(),
  driver: z.string().trim().min(1).max(64),
  backendUrl: z.string().trim().max(2000).nullable().optional(),
  apiKey: z.string().trim().min(1).max(4000).optional(),
});

function publicProvider(row: {
  id: string;
  driver: string;
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
    driver: row.driver,
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
          availableDrivers: LLM_PROVIDER_IDS,
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
    if (!isLlmProviderInstanceId(parsed.data.id)) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Provider id must be a lowercase slug (a-z, 0-9, _, -)',
      );
    }
    if (!isLlmProviderId(parsed.data.driver)) {
      throw new AppError('INVALID_REQUEST', 400, 'Unsupported LLM driver');
    }
    const backendUrl = parsed.data.backendUrl?.trim() || null;
    if (providerRequiresBaseUrl(parsed.data.driver) && !backendUrl) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'openai_compatible requires a Base URL',
      );
    }
    const existing = await catalog().getProvider(parsed.data.id);
    if (existing && existing.driver !== parsed.data.driver) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Provider driver cannot be changed after create',
      );
    }
    if (parsed.data.enabled && !parsed.data.apiKey) {
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
      driver: parsed.data.driver,
      displayName: parsed.data.displayName,
      enabled: parsed.data.enabled,
      backendUrl,
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
        driver: row.driver,
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
        driver: row.driver,
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

  app.post('/admin/llm/providers/test', async (context) => {
    const parsed = providerTestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid provider test payload');
    }
    if (!isLlmProviderId(parsed.data.driver)) {
      throw new AppError('INVALID_REQUEST', 400, 'Unsupported LLM driver');
    }

    let apiKey = parsed.data.apiKey?.trim() || null;
    let backendUrl = parsed.data.backendUrl ?? null;
    if (parsed.data.providerId) {
      const existing = await catalog().getProvider(parsed.data.providerId);
      if (!apiKey && existing?.apiKeyCiphertext) {
        apiKey = await dependencies.llmSecrets.decrypt(existing.apiKeyCiphertext);
      }
      if (backendUrl == null && existing) {
        backendUrl = existing.backendUrl;
      }
    }
    if (providerRequiresBaseUrl(parsed.data.driver) && !backendUrl?.trim()) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'openai_compatible requires a Base URL',
      );
    }

    const result = await testProviderConnection({
      driver: parsed.data.driver,
      apiKey,
      backendUrl,
    });
    if (!result.ok) {
      throw new AppError('UPSTREAM_ERROR', 502, result.error);
    }
    return context.json(
      apiSuccess(
        {
          ok: true,
          message: result.message,
          modelCount: result.modelCount,
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/admin/llm/providers/:id/upstream-models', async (context) => {
    const id = context.req.param('id');
    const provider = await catalog().getProvider(id);
    if (!provider) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    const apiKey = provider.apiKeyCiphertext
      ? await dependencies.llmSecrets.decrypt(provider.apiKeyCiphertext)
      : null;
    const result = await listUpstreamModels({
      driver: provider.driver,
      apiKey,
      backendUrl: provider.backendUrl,
    });
    if (!result.ok) {
      throw new AppError('UPSTREAM_ERROR', 502, result.error);
    }
    return context.json(
      apiSuccess({ models: result.models }, context.get('requestId')),
    );
  });

  app.delete('/admin/llm/providers/:id', async (context) => {
    const id = context.req.param('id');
    const models = await catalog().listModels({ providerId: id });
    if (models.length > 0 && context.req.query('force') !== '1') {
      throw new AppError(
        'CONFLICT',
        409,
        `Provider still has ${models.length} model(s); delete them first or confirm force delete`,
      );
    }
    const deleted = await catalog().deleteProvider(id);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 404, 'Provider not found');
    }
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_providers.delete',
      targetType: 'llm_provider',
      targetId: id,
      metadata: { modelCount: models.length, forced: models.length > 0 },
    });
    return context.json(
      apiSuccess({ id, deletedModels: models.length }, context.get('requestId')),
    );
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
      driver: provider.driver,
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
      driver: provider.driver,
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
    const value = await validateLlmDefaults(catalog(), parsed.data);
    await dependencies.database.settings.set(
      LLM_SETTINGS_KEY,
      value,
      context.get('auth').userId,
    );
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'llm_defaults.update',
      targetType: 'system_settings',
      targetId: LLM_SETTINGS_KEY,
      metadata: value,
    });
    return context.json(apiSuccess(value, context.get('requestId')));
  });

  return app;
}
